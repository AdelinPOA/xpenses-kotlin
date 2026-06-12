import asyncio

import boto3
from botocore.client import Config

from .base import BaseStorageProvider


class S3StorageProvider(BaseStorageProvider):
    def __init__(self, endpoint_url: str = "", access_key: str = "", secret_key: str = "", bucket_name: str = "", region_name: str = ""):
        self.endpoint_url = endpoint_url or None
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket_name = bucket_name
        self.region_name = region_name or None

    def _get_client(self):
        # We can construct client dynamically or reuse it
        return boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region_name,
            config=Config(signature_version="s3v4", connect_timeout=5, read_timeout=5)
        )

    async def upload_file(self, relative_path: str, content: bytes) -> None:
        await asyncio.to_thread(self._upload_file_sync, relative_path, content)

    def _upload_file_sync(self, relative_path: str, content: bytes) -> None:
        client = self._get_client()
        client.put_object(
            Bucket=self.bucket_name,
            Key=relative_path,
            Body=content
        )

    async def download_file(self, relative_path: str) -> bytes:
        return await asyncio.to_thread(self._download_file_sync, relative_path)

    def _download_file_sync(self, relative_path: str) -> bytes:
        client = self._get_client()
        try:
            resp = client.get_object(
                Bucket=self.bucket_name,
                Key=relative_path
            )
            return resp["Body"].read()
        except client.exceptions.NoSuchKey as e:
            raise FileNotFoundError(f"S3 key not found: {relative_path} ({str(e)})")

    async def delete_file(self, relative_path: str) -> None:
        await asyncio.to_thread(self._delete_file_sync, relative_path)

    def _delete_file_sync(self, relative_path: str) -> None:
        client = self._get_client()
        try:
            client.delete_object(
                Bucket=self.bucket_name,
                Key=relative_path
            )
        except Exception:
            pass

    async def file_exists(self, relative_path: str) -> bool:
        return await asyncio.to_thread(self._file_exists_sync, relative_path)

    def _file_exists_sync(self, relative_path: str) -> bool:
        client = self._get_client()
        try:
            client.head_object(
                Bucket=self.bucket_name,
                Key=relative_path
            )
            return True
        except Exception:
            return False

    async def list_files(self) -> list[str]:
        return await asyncio.to_thread(self._list_files_sync)

    def _list_files_sync(self) -> list[str]:
        client = self._get_client()
        paginator = client.get_paginator("list_objects_v2")
        files_list = []
        try:
            for page in paginator.paginate(Bucket=self.bucket_name):
                for obj in page.get("Contents", []):
                    files_list.append(obj["Key"])
        except Exception:
            pass
        return files_list

    async def test_connection(self) -> tuple[bool, str]:
        return await asyncio.to_thread(self._test_connection_sync)

    def _test_connection_sync(self) -> tuple[bool, str]:
        try:
            client = self._get_client()
            test_key = "_conn_test.txt"
            
            # Put test object
            client.put_object(
                Bucket=self.bucket_name,
                Key=test_key,
                Body=b"test connection"
            )
            
            # Get test object
            resp = client.get_object(
                Bucket=self.bucket_name,
                Key=test_key
            )
            data = resp["Body"].read()
            if data != b"test connection":
                return False, "Data verification mismatch"
                
            # Delete test object
            client.delete_object(
                Bucket=self.bucket_name,
                Key=test_key
            )
            return True, ""
        except Exception as e:
            return False, f"S3 Connection failed: {str(e)}"
