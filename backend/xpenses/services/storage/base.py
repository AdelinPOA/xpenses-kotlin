from abc import ABC, abstractmethod


class BaseStorageProvider(ABC):
    @abstractmethod
    async def upload_file(self, relative_path: str, content: bytes) -> None:
        """Uploads file content to the storage destination."""
        pass

    @abstractmethod
    async def download_file(self, relative_path: str) -> bytes:
        """Downloads file content from the storage destination."""
        pass

    @abstractmethod
    async def delete_file(self, relative_path: str) -> None:
        """Deletes file from the storage destination."""
        pass

    @abstractmethod
    async def file_exists(self, relative_path: str) -> bool:
        """Checks if a file exists on the storage destination."""
        pass

    @abstractmethod
    async def list_files(self) -> list[str]:
        """Returns a list of all relative file paths present in the storage."""
        pass

    @abstractmethod
    async def test_connection(self) -> tuple[bool, str]:
        """Verifies access by establishing a connection and trying a test read/write."""
        pass
