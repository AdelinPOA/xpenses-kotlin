import os
from pathlib import Path

import aiofiles

from .base import BaseStorageProvider


class LocalStorageProvider(BaseStorageProvider):
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir).resolve()

    def _get_absolute_path(self, relative_path: str) -> Path:
        target = (self.base_dir / relative_path).resolve()
        # Path traversal protection
        if not target.is_relative_to(self.base_dir):
            raise ValueError("Invalid target filepath")
        return target

    async def upload_file(self, relative_path: str, content: bytes) -> None:
        full_path = self._get_absolute_path(relative_path)
        os.makedirs(full_path.parent, exist_ok=True)
        async with aiofiles.open(full_path, "wb") as f:
            await f.write(content)

    async def download_file(self, relative_path: str) -> bytes:
        full_path = self._get_absolute_path(relative_path)
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {relative_path}")
        async with aiofiles.open(full_path, "rb") as f:
            return await f.read()

    async def delete_file(self, relative_path: str) -> None:
        full_path = self._get_absolute_path(relative_path)
        if full_path.exists():
            full_path.unlink()

    async def file_exists(self, relative_path: str) -> bool:
        full_path = self._get_absolute_path(relative_path)
        return full_path.exists()

    async def list_files(self) -> list[str]:
        files_list = []
        if not self.base_dir.exists():
            return files_list
        for root, _, files in os.walk(self.base_dir):
            for file in files:
                full_path = Path(root) / file
                # Ignore the cache directory itself
                if "cache" in full_path.parts:
                    continue
                try:
                    rel_path = str(full_path.relative_to(self.base_dir))
                    files_list.append(rel_path)
                except ValueError:
                    continue
        return files_list

    async def test_connection(self) -> tuple[bool, str]:
        try:
            os.makedirs(self.base_dir, exist_ok=True)
            test_file = "_conn_test.txt"
            await self.upload_file(test_file, b"test connection")
            exists = await self.file_exists(test_file)
            if not exists:
                return False, "Uploaded file could not be verified"
            data = await self.download_file(test_file)
            if data != b"test connection":
                return False, "Data read mismatch"
            await self.delete_file(test_file)
            return True, ""
        except Exception as e:
            return False, f"Local directory access error: {str(e)}"
