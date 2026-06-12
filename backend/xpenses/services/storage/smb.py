import asyncio
import os

import smbclient

from .base import BaseStorageProvider


class SMBStorageProvider(BaseStorageProvider):
    def __init__(self, host: str, share: str, username: str = "", password: str = "", domain: str = "", folder: str = "receipts"):
        self.host = host
        self.share = share
        self.username = username or None
        self.password = password or None
        self.domain = domain or None
        self.folder = folder.strip("/")

    def _get_smb_path(self, relative_path: str) -> str:
        # Construct SMB path: \\host\share\folder\relative_path
        parts = [self.folder] if self.folder else []
        parts.extend(relative_path.replace("\\", "/").split("/"))
        subpath = "\\".join(p for p in parts if p)
        return rf"\\{self.host}\{self.share}\{subpath}"

    def _ensure_session(self):
        try:
            smbclient.register_session(
                self.host,
                username=self.username,
                password=self.password,
                domain=self.domain
            )
        except Exception:
            # If already registered, it might raise, which is fine
            pass

    async def upload_file(self, relative_path: str, content: bytes) -> None:
        await asyncio.to_thread(self._upload_file_sync, relative_path, content)

    def _upload_file_sync(self, relative_path: str, content: bytes) -> None:
        self._ensure_session()
        smb_path = self._get_smb_path(relative_path)
        # Ensure parent directory exists
        parent = os.path.dirname(smb_path)
        try:
            smbclient.makedirs(parent, exist_ok=True)
        except Exception:
            pass
        with smbclient.open_file(smb_path, mode="wb") as f:
            f.write(content)

    async def download_file(self, relative_path: str) -> bytes:
        return await asyncio.to_thread(self._download_file_sync, relative_path)

    def _download_file_sync(self, relative_path: str) -> bytes:
        self._ensure_session()
        smb_path = self._get_smb_path(relative_path)
        try:
            with smbclient.open_file(smb_path, mode="rb") as f:
                return f.read()
        except OSError as e:
            raise FileNotFoundError(f"SMB file not found: {relative_path} ({str(e)})")

    async def delete_file(self, relative_path: str) -> None:
        await asyncio.to_thread(self._delete_file_sync, relative_path)

    def _delete_file_sync(self, relative_path: str) -> None:
        self._ensure_session()
        smb_path = self._get_smb_path(relative_path)
        try:
            smbclient.remove(smb_path)
        except Exception:
            pass

    async def file_exists(self, relative_path: str) -> bool:
        return await asyncio.to_thread(self._file_exists_sync, relative_path)

    def _file_exists_sync(self, relative_path: str) -> bool:
        self._ensure_session()
        smb_path = self._get_smb_path(relative_path)
        try:
            smbclient.stat(smb_path)
            return True
        except Exception:
            return False

    async def list_files(self) -> list[str]:
        return await asyncio.to_thread(self._list_files_sync)

    def _list_files_sync(self) -> list[str]:
        self._ensure_session()
        prefix = rf"\\{self.host}\{self.share}"
        if self.folder:
            prefix = rf"{prefix}\{self.folder}"
        
        files_list = []
        try:
            for root, _, files in smbclient.walk(prefix):
                for file in files:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, prefix).replace("\\", "/")
                    files_list.append(rel_path)
        except Exception:
            pass
        return files_list

    async def test_connection(self) -> tuple[bool, str]:
        return await asyncio.to_thread(self._test_connection_sync)

    def _test_connection_sync(self) -> tuple[bool, str]:
        try:
            self._ensure_session()
            # Try to list the share or create a test file
            test_path = self._get_smb_path("_conn_test.txt")
            parent = os.path.dirname(test_path)
            try:
                smbclient.makedirs(parent, exist_ok=True)
            except Exception:
                pass
            with smbclient.open_file(test_path, mode="wb") as f:
                f.write(b"test connection")
            with smbclient.open_file(test_path, mode="rb") as f:
                data = f.read()
            if data != b"test connection":
                return False, "Data verification mismatch"
            smbclient.remove(test_path)
            return True, ""
        except Exception as e:
            return False, f"SMB Connection failed: {str(e)}"
