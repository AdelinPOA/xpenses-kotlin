from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_role
from ..database import get_pool
from ..services.ldap_service import (
    LdapConfig,
    get_ldap_config,
    save_ldap_config,
    sync_users,
    test_connection,
)

router = APIRouter(prefix="/api/settings/ldap", tags=["ldap"])


class LdapConfigIn(BaseModel):
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
    role_map: dict = Field(default_factory=dict)
    default_role: str = "technician"
    use_stored_password: bool = False


class LdapConfigOut(LdapConfigIn):
    bind_password: str = "***"
    bind_password_invalid: bool = False


@router.get("", response_model=LdapConfigOut)
async def get_ldap(current_user: dict = require_role("mod")):
    pool = get_pool()
    config = await get_ldap_config(pool)
    return LdapConfigOut(
        enabled=config.enabled,
        host=config.host,
        port=config.port,
        use_tls=config.use_tls,
        bind_dn=config.bind_dn,
        bind_password="***",
        base_dn=config.base_dn,
        user_filter=config.user_filter,
        attr_username=config.attr_username,
        attr_email=config.attr_email,
        attr_display_name=config.attr_display_name,
        attr_role=config.attr_role,
        role_map=config.role_map,
        default_role=config.default_role,
        bind_password_invalid=config.bind_password_invalid,
    )


@router.patch("", response_model=LdapConfigOut)
async def update_ldap(body: LdapConfigIn, current_user: dict = require_role("mod")):
    if body.enabled and (not body.host or not body.base_dn or not body.bind_dn):
        raise HTTPException(422, "host, base_dn, and bind_dn are required when enabling LDAP")

    pool = get_pool()

    if body.bind_password == "":
        existing = await get_ldap_config(pool)
        password = existing.bind_password
    else:
        password = body.bind_password

    config = LdapConfig(
        enabled=body.enabled,
        host=body.host,
        port=body.port,
        use_tls=body.use_tls,
        bind_dn=body.bind_dn,
        bind_password=password,
        base_dn=body.base_dn,
        user_filter=body.user_filter,
        attr_username=body.attr_username,
        attr_email=body.attr_email,
        attr_display_name=body.attr_display_name,
        attr_role=body.attr_role,
        role_map=body.role_map,
        default_role=body.default_role,
    )
    await save_ldap_config(config, pool)

    return LdapConfigOut(
        enabled=config.enabled,
        host=config.host,
        port=config.port,
        use_tls=config.use_tls,
        bind_dn=config.bind_dn,
        bind_password="***",
        base_dn=config.base_dn,
        user_filter=config.user_filter,
        attr_username=config.attr_username,
        attr_email=config.attr_email,
        attr_display_name=config.attr_display_name,
        attr_role=config.attr_role,
        role_map=config.role_map,
        default_role=config.default_role,
        bind_password_invalid=False,
    )


@router.post("/test")
async def test_ldap(body: LdapConfigIn, current_user: dict = require_role("mod")):
    bind_password = body.bind_password
    if body.use_stored_password:
        existing = await get_ldap_config(get_pool())
        bind_password = existing.bind_password

    config = LdapConfig(
        enabled=body.enabled,
        host=body.host,
        port=body.port,
        use_tls=body.use_tls,
        bind_dn=body.bind_dn,
        bind_password=bind_password,
        base_dn=body.base_dn,
        user_filter=body.user_filter,
        attr_username=body.attr_username,
        attr_email=body.attr_email,
        attr_display_name=body.attr_display_name,
        attr_role=body.attr_role,
        role_map=body.role_map,
        default_role=body.default_role,
    )
    return await test_connection(config)


@router.post("/sync")
async def sync_ldap(current_user: dict = require_role("mod")):
    pool = get_pool()
    config = await get_ldap_config(pool)
    if not config.enabled:
        raise HTTPException(400, "LDAP is not enabled")
    return await sync_users(config, pool)
