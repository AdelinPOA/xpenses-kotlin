import asyncio
import os

import paramiko

from .base import BaseStorageProvider


class SFTPStorageProvider(BaseStorageProvider):
    def __init__(self, host: str, port: int = 22, username: str = "", password: str = "", folder: str = "receipts"):
        self.host = host
        self.port = port or 22
        self.username = username
        self.password = password
        self.folder = folder.strip("/")

    def _get_remote_path(self, relative_path: str) -> str:
        parts = [self.folder] if self.folder else []
        parts.extend(relative_path.lstrip("/").split("/"))
        return "/" + "/".join(p for p in parts if p)

    def _get_sftp_client(self) -> tuple[paramiko.SSHClient, paramiko.SFTPClient]:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
            timeout=10
        )
        sftp = client.open_sftp()
        return client, sftp

    def _ensure_directories_sync(self, sftp: paramiko.SFTPClient, remote_path: str) -> None:
        dir_path = os.path.dirname(remote_path)
        parts = dir_path.split("/")
        current = ""
        for part in parts:
            if not part:
                if dir_path.startswith("/"):
                    current = "/"
                continue
            current = os.path.join(current, part)
            try:
                sftp.mkdir(current)
            except OSError:
                pass

    async def upload_file(self, relative_path: str, content: bytes) -> None:
        await asyncio.to_thread(self._upload_file_sync, relative_path, content)

    def _upload_file_sync(self, relative_path: str, content: bytes) -> None:
        client, sftp = self._get_sftp_client()
        try:
            remote_path = self._get_remote_path(relative_path)
            self._ensure_directories_sync(sftp, remote_path)
            with sftp.open(remote_path, "wb") as f:
                f.write(content)
        finally:
            sftp.close()
            client.close()

    async def download_file(self, relative_path: str) -> bytes:
        return await asyncio.to_thread(self._download_file_sync, relative_path)

    def _download_file_sync(self, relative_path: str) -> bytes:
        client, sftp = self._get_sftp_client()
        try:
            remote_path = self._get_remote_path(relative_path)
            try:
                with sftp.open(remote_path, "rb") as f:
                    return f.read()
            except FileNotFoundError as e:
                raise FileNotFoundError(f"SFTP file not found: {relative_path} ({str(e)})")
        finally:
            sftp.close()
            client.close()

    async def delete_file(self, relative_path: str) -> None:
        await asyncio.to_thread(self._delete_file_sync, relative_path)

    def _delete_file_sync(self, relative_path: str) -> None:
        client, sftp = self._get_sftp_client()
        try:
            remote_path = self._get_remote_path(relative_path)
            try:
                sftp.remove(remote_path)
            except FileNotFoundError:
                pass
        finally:
            sftp.close()
            client.close()

    async def file_exists(self, relative_path: str) -> bool:
        return await asyncio.to_thread(self._file_exists_sync, relative_path)

    def _file_exists_sync(self, relative_path: str) -> bool:
        client, sftp = self._get_sftp_client()
        try:
            remote_path = self._get_remote_path(relative_path)
            try:
                sftp.stat(remote_path)
                return True
            except FileNotFoundError:
                return False
        finally:
            sftp.close()
            client.close()

    async def list_files(self) -> list[str]:
        return await asyncio.to_thread(self._list_files_sync)

    def _list_files_sync(self) -> list[str]:
        client, sftp = self._get_sftp_client()
        files_list = []
        try:
            base_dir = "/" + self.folder if self.folder else "/"
            # Check if base dir exists first
            try:
                sftp.stat(base_dir)
                self._walk_sftp(sftp, base_dir, base_dir, files_list)
            except FileNotFoundError:
                pass
        finally:
            sftp.close()
            client.close()
        return files_list

    def _walk_sftp(self, sftp, current_dir, base_dir, files_list):
        try:
            for item in sftp.listdir_attr(current_dir):
                full_path = os.path.join(current_dir, item.filename)
                import stat
                if stat.S_ISDIR(item.st_mode):
                    self._walk_sftp(sftp, full_path, base_dir, files_list)
                else:
                    rel_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
                    if rel_path.startswith("./"):
                        rel_path = rel_path[2:]
                    files_list.append(rel_path)
        except Exception:
            pass

    async def test_connection(self) -> tuple[bool, str]:
        return await asyncio.to_thread(self._test_connection_sync)

    def _test_connection_sync(self) -> tuple[bool, str]:
        try:
            client, sftp = self._get_sftp_client()
            try:
                test_path = self._get_remote_path("_conn_test.txt")
                self._ensure_directories_sync(sftp, test_path)
                with sftp.open(test_path, "wb") as f:
                    f.write(b"test connection")
                with sftp.open(test_path, "rb") as f:
                    data = f.read()
                if data != b"test connection":
                    return False, "Data verification mismatch"
                sftp.remove(test_path)
                return True, ""
            finally:
                sftp.close()
                client.close()
        except Exception as e:
            return False, f"SFTP connection failed: {str(e)}"
