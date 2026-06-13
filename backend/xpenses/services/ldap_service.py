import asyncio
import dataclasses
import datetime
import json

import asyncpg  # noqa: F401 (used via pool.acquire())
import ldap3
import ldap3.core.exceptions
import ldap3.utils.conv
from cryptography.fernet import Fernet, InvalidToken

from .crypto import get_fernet


class LDAPUnavailableError(Exception):
    pass


class LDAPBindError(Exception):
    pass


VALID_ROLES = {"technician", "manager", "chef_finance", "mod"}


@dataclasses.dataclass
class LdapConfig:
    enabled: bool = False
    host: str = ""
    port: int = 389
    use_tls: bool = False
    bind_dn: str = ""
    bind_password: str = ""
    base_dn: str = ""
    user_filter: str = "(objectClass=person)"
    attr_username: str = "uid"
    attr_email: str = "mail"
    attr_display_name: str = "cn"
    attr_role: str = "memberOf"
    role_map: dict = dataclasses.field(default_factory=dict)
    default_role: str = "technician"
    bind_password_invalid: bool = False


def _make_fernet() -> Fernet:
    return get_fernet()



def _map_role(groups: list[str], role_map: dict, default_role: str) -> str:
    for group in groups:
        if group in role_map:
            mapped = role_map[group]
            if mapped in VALID_ROLES:
                return mapped
            return default_role
    return default_role


async def get_ldap_config(pool) -> LdapConfig:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT value FROM app_settings WHERE key = 'ldap_config'"
        )
    if not row:
        return LdapConfig()

    data = json.loads(row["value"])
    encrypted_pw = data.get("bind_password", "")
    bind_password_invalid = False

    if encrypted_pw:
        try:
            fernet = _make_fernet()
            decrypted = fernet.decrypt(encrypted_pw.encode()).decode()
        except (InvalidToken, Exception):
            decrypted = ""
            bind_password_invalid = True
    else:
        decrypted = ""

    return LdapConfig(
        enabled=data.get("enabled", False),
        host=data.get("host", ""),
        port=data.get("port", 389),
        use_tls=data.get("use_tls", False),
        bind_dn=data.get("bind_dn", ""),
        bind_password=decrypted,
        base_dn=data.get("base_dn", ""),
        user_filter=data.get("user_filter", "(objectClass=person)"),
        attr_username=data.get("attr_username", "uid"),
        attr_email=data.get("attr_email", "mail"),
        attr_display_name=data.get("attr_display_name", "cn"),
        attr_role=data.get("attr_role", "memberOf"),
        role_map=data.get("role_map", {}),
        default_role=data.get("default_role", "technician"),
        bind_password_invalid=bind_password_invalid,
    )


async def save_ldap_config(config: LdapConfig, pool) -> None:
    if config.bind_password:
        fernet = _make_fernet()
        encrypted_pw = fernet.encrypt(config.bind_password.encode()).decode()
    else:
        encrypted_pw = ""

    data = {
        "enabled": config.enabled,
        "host": config.host,
        "port": config.port,
        "use_tls": config.use_tls,
        "bind_dn": config.bind_dn,
        "bind_password": encrypted_pw,
        "base_dn": config.base_dn,
        "user_filter": config.user_filter,
        "attr_username": config.attr_username,
        "attr_email": config.attr_email,
        "attr_display_name": config.attr_display_name,
        "attr_role": config.attr_role,
        "role_map": config.role_map,
        "default_role": config.default_role,
    }

    now = datetime.datetime.now(datetime.timezone.utc)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('ldap_config', $1, $2)
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = $2
            """,
            json.dumps(data),
            now,
        )


async def test_connection(config: LdapConfig) -> dict:
    return await asyncio.to_thread(_test_connection_sync, config)


def _test_connection_sync(config: LdapConfig) -> dict:
    if not config.host:
        return {"ok": False, "preview": [], "error": "No host configured"}

    try:
        server = ldap3.Server(
            config.host,
            port=config.port,
            use_ssl=config.use_tls,
            get_info=ldap3.ALL,
        )
        conn = ldap3.Connection(
            server,
            user=config.bind_dn,
            password=config.bind_password,
            auto_bind=True,
        )
        conn.search(
            search_base=config.base_dn,
            search_filter=config.user_filter,
            search_scope=ldap3.SUBTREE,
            attributes=[
                config.attr_username,
                config.attr_email,
                config.attr_display_name,
                config.attr_role,
            ],
            size_limit=5,
        )

        preview = []
        for entry in conn.entries:
            def _attr(name: str, default="") -> str:
                val = getattr(entry, name, None)
                if val is None:
                    return default
                raw = val.value
                if isinstance(raw, list):
                    return raw[0] if raw else default
                return str(raw) if raw is not None else default

            def _attr_list(name: str) -> list[str]:
                val = getattr(entry, name, None)
                if val is None:
                    return []
                raw = val.value
                if isinstance(raw, list):
                    return [str(v) for v in raw]
                if raw is None:
                    return []
                return [str(raw)]

            groups = _attr_list(config.attr_role)
            mapped_role = _map_role(groups, config.role_map, config.default_role)
            preview.append(
                {
                    "username": _attr(config.attr_username),
                    "email": _attr(config.attr_email),
                    "display_name": _attr(config.attr_display_name),
                    "mapped_role": mapped_role,
                }
            )

        conn.unbind()
        return {"ok": True, "preview": preview, "error": None}

    except ldap3.core.exceptions.LDAPException as e:
        return {"ok": False, "preview": [], "error": str(e)}
    except Exception as e:
        return {"ok": False, "preview": [], "error": str(e)}


def _fetch_directory_entries(config: LdapConfig) -> list:
    server = ldap3.Server(
        config.host,
        port=config.port,
        use_ssl=config.use_tls,
        get_info=ldap3.ALL,
    )
    conn = ldap3.Connection(
        server,
        user=config.bind_dn,
        password=config.bind_password,
        auto_bind=True,
    )
    conn.search(
        search_base=config.base_dn,
        search_filter=config.user_filter,
        search_scope=ldap3.SUBTREE,
        attributes=[
            config.attr_username,
            config.attr_email,
            config.attr_display_name,
            config.attr_role,
        ],
    )
    entries = list(conn.entries)
    conn.unbind()
    return entries


async def sync_users(config: LdapConfig, pool) -> dict:
    if not config.enabled:
        raise ValueError("LDAP is not enabled")

    entries = await asyncio.to_thread(_fetch_directory_entries, config)

    stats = {
        "created": 0,
        "updated": 0,
        "deactivated": 0,
        "skipped": 0,
        "default_role_assigned": 0,
    }

    directory_usernames: set[str] = set()

    def _attr(entry, name: str, default="") -> str:
        val = getattr(entry, name, None)
        if val is None:
            return default
        raw = val.value
        if isinstance(raw, list):
            return raw[0] if raw else default
        return str(raw) if raw is not None else default

    def _attr_list(entry, name: str) -> list[str]:
        val = getattr(entry, name, None)
        if val is None:
            return []
        raw = val.value
        if isinstance(raw, list):
            return [str(v) for v in raw]
        if raw is None:
            return []
        return [str(raw)]

    async with pool.acquire() as conn_db:
        now = datetime.datetime.now(datetime.timezone.utc)

        for entry in entries:
            username = _attr(entry, config.attr_username)
            if not username:
                continue

            directory_usernames.add(username)
            email = _attr(entry, config.attr_email)
            display_name = _attr(entry, config.attr_display_name)
            groups = _attr_list(entry, config.attr_role)
            role = _map_role(groups, config.role_map, config.default_role)
            used_default = role == config.default_role

            row = await conn_db.fetchrow(
                "SELECT id, username, display_name, email, role, is_active, auth_source"
                " FROM users WHERE username = $1",
                username,
            )

            if not row:
                await conn_db.execute(
                    """
                    INSERT INTO users
                        (username, display_name, email, password_hash,
                         auth_source, role, is_active, created_at, updated_at)
                    VALUES ($1, $2, $3, NULL, 'ldap', $4, true, $5, $5)
                    """,
                    username,
                    display_name,
                    email,
                    role,
                    now,
                )
                stats["created"] += 1
                if used_default:
                    stats["default_role_assigned"] += 1

            elif row["auth_source"] == "local":
                stats["skipped"] += 1

            else:
                changed = (
                    row["display_name"] != display_name
                    or row["email"] != email
                    or row["role"] != role
                    or not row["is_active"]
                )
                if changed:
                    await conn_db.execute(
                        """
                        UPDATE users
                        SET display_name=$1, email=$2, role=$3,
                            is_active=true, updated_at=$4
                        WHERE username=$5
                        """,
                        display_name,
                        email,
                        role,
                        now,
                        username,
                    )
                    stats["updated"] += 1

        # Deactivate LDAP users no longer in directory
        ldap_rows = await conn_db.fetch(
            "SELECT id, username FROM users WHERE auth_source='ldap' AND is_active=true"
        )
        for ldap_row in ldap_rows:
            if ldap_row["username"] not in directory_usernames:
                await conn_db.execute(
                    "UPDATE users SET is_active=false, updated_at=$1 WHERE id=$2",
                    now,
                    ldap_row["id"],
                )
                await conn_db.execute(
                    "DELETE FROM refresh_tokens WHERE user_id=$1",
                    ldap_row["id"],
                )
                stats["deactivated"] += 1

    return stats


def _authenticate_ldap_sync(username: str, password: str, config: LdapConfig) -> bool:
    if not password:
        raise LDAPBindError("Empty password not allowed")
    try:
        server = ldap3.Server(
            config.host,
            port=config.port,
            use_ssl=config.use_tls,
            get_info=ldap3.ALL,
        )
        # Bind as service account to find the user's DN
        service_conn = ldap3.Connection(
            server,
            user=config.bind_dn,
            password=config.bind_password,
            auto_bind=True,
        )
        service_conn.search(
            search_base=config.base_dn,
            search_filter=f"({config.attr_username}={ldap3.utils.conv.escape_filter_chars(username)})",
            search_scope=ldap3.SUBTREE,
            attributes=["dn"],
        )

        if not service_conn.entries:
            service_conn.unbind()
            raise LDAPBindError("User not found in directory")

        user_dn = service_conn.entries[0].entry_dn
        service_conn.unbind()

        # Re-bind as the user to verify password
        user_conn = ldap3.Connection(
            server,
            user=user_dn,
            password=password,
            auto_bind=True,
        )
        user_conn.unbind()
        return True

    except LDAPBindError:
        raise
    except ldap3.core.exceptions.LDAPBindError as e:
        raise LDAPBindError(str(e)) from e
    except ldap3.core.exceptions.LDAPSocketOpenError as e:
        raise LDAPUnavailableError(str(e)) from e
    except ldap3.core.exceptions.LDAPException as e:
        raise LDAPUnavailableError(str(e)) from e
    except OSError as e:
        raise LDAPUnavailableError(str(e)) from e


async def authenticate_ldap(
    username: str, password: str, config: LdapConfig
) -> bool:
    return await asyncio.to_thread(_authenticate_ldap_sync, username, password, config)

