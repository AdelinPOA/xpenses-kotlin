import httpx

from .base import BaseStorageProvider


class WebDAVStorageProvider(BaseStorageProvider):
    def __init__(self, url: str, username: str = "", password: str = "", folder: str = "receipts"):
        self.url = url.rstrip("/")
        self.username = username
        self.password = password
        self.folder = folder.strip("/")
        self.auth = httpx.BasicAuth(username, password) if username else None

    def _get_url(self, relative_path: str) -> str:
        parts = [self.folder] if self.folder else []
        parts.extend(relative_path.lstrip("/").split("/"))
        subpath = "/".join(p for p in parts if p)
        return f"{self.url}/{subpath}"

    async def _ensure_directories(self, relative_path: str) -> None:
        # Step-by-step MKCOL for parent folders
        parts = [self.folder] if self.folder else []
        parent_parts = relative_path.lstrip("/").split("/")[:-1]
        parts.extend(parent_parts)

        async with httpx.AsyncClient(auth=self.auth) as client:
            current_path = ""
            for p in parts:
                if not p:
                    continue
                current_path = f"{current_path}/{p}" if current_path else p
                url = f"{self.url}/{current_path}"
                try:
                    # Try MKCOL
                    await client.request("MKCOL", url)
                    # 201 Created is success, 405 Method Not Allowed means it already exists.
                    # Ignore other codes (e.g. 409) and let the PUT handle errors if creation failed.
                except Exception:
                    pass

    async def upload_file(self, relative_path: str, content: bytes) -> None:
        await self._ensure_directories(relative_path)
        url = self._get_url(relative_path)
        async with httpx.AsyncClient(auth=self.auth) as client:
            resp = await client.put(url, content=content)
            resp.raise_for_status()

    async def download_file(self, relative_path: str) -> bytes:
        url = self._get_url(relative_path)
        async with httpx.AsyncClient(auth=self.auth) as client:
            resp = await client.get(url)
            if resp.status_code == 404:
                raise FileNotFoundError(f"WebDAV file not found: {relative_path}")
            resp.raise_for_status()
            return resp.content

    async def delete_file(self, relative_path: str) -> None:
        url = self._get_url(relative_path)
        async with httpx.AsyncClient(auth=self.auth) as client:
            resp = await client.delete(url)
            # Ignore 404 on delete
            if resp.status_code != 404:
                resp.raise_for_status()

    async def file_exists(self, relative_path: str) -> bool:
        url = self._get_url(relative_path)
        async with httpx.AsyncClient(auth=self.auth) as client:
            try:
                # PROPFIND is standard for checking WebDAV existence
                resp = await client.request("PROPFIND", url, headers={"Depth": "0"})
                return resp.status_code in (200, 207)
            except Exception:
                return False

    async def list_files(self) -> list[str]:
        files_list = []
        base_path = self.folder if self.folder else ""
        async with httpx.AsyncClient(auth=self.auth) as client:
            await self._walk_webdav(client, base_path, base_path, files_list)
        return files_list

    async def _walk_webdav(self, client, current_dir, base_dir, files_list):
        url = self.url
        if current_dir:
            url = f"{self.url}/{current_dir.lstrip('/')}"
        try:
            resp = await client.request("PROPFIND", url, headers={"Depth": "1"})
            if resp.status_code not in (200, 207):
                return
            
            import xml.etree.ElementTree as ET
            root = ET.fromstring(resp.content)
            
            ns = {"d": "DAV:"}
            for response in root.findall(".//d:response", ns):
                href_el = response.find("d:href", ns)
                if href_el is None or not href_el.text:
                    continue
                from urllib.parse import unquote, urlparse
                href = unquote(href_el.text)
                
                is_dir = False
                res_type = response.find(".//d:resourcetype", ns)
                if res_type is not None:
                    if res_type.find("d:collection", ns) is not None:
                        is_dir = True
                if href.endswith("/"):
                    is_dir = True
                
                url_path = urlparse(self.url).path.rstrip("/")
                href_path = urlparse(href).path.rstrip("/")
                
                base_path_full = f"{url_path}/{base_dir}".rstrip("/")
                if href_path == base_path_full:
                    continue
                
                if href_path.startswith(base_path_full + "/"):
                    rel_path = href_path[len(base_path_full) + 1:]
                    if is_dir:
                        await self._walk_webdav(client, f"{base_dir}/{rel_path}".strip("/"), base_dir, files_list)
                    else:
                        files_list.append(rel_path)
        except Exception:
            pass

    async def test_connection(self) -> tuple[bool, str]:
        try:
            # First, check connection to base URL using GET or PROPFIND
            async with httpx.AsyncClient(auth=self.auth) as client:
                resp = await client.request("PROPFIND", self.url, headers={"Depth": "0"})
                if resp.status_code not in (200, 207):
                    return False, f"WebDAV endpoint returned status code {resp.status_code}"
            
            # Try a write / read / delete cycle
            test_file = "_conn_test.txt"
            await self.upload_file(test_file, b"test connection")
            data = await self.download_file(test_file)
            if data != b"test connection":
                return False, "Data verification mismatch"
            await self.delete_file(test_file)
            return True, ""
        except Exception as e:
            return False, f"WebDAV Connection failed: {str(e)}"
