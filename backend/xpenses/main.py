from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import (
    advances,
    app_settings,
    auth,
    categories,
    dashboard,
    expenses,
    mileage,
    ocr,
    reports,
    signature,
    users,
)
from .routers import (
    email_settings as email_settings_router,
)
from .routers import (
    ldap as ldap_router,
)
from .routers import (
    imap_settings as imap_settings_router,
)
from .seed import seed_users
from .services.imap_daemon import start_imap_daemon, stop_imap_daemon


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_users()
    start_imap_daemon()
    yield
    stop_imap_daemon()



app = FastAPI(title="xpenses API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(categories.router)
app.include_router(expenses.router)
app.include_router(reports.router)
app.include_router(advances.router)
app.include_router(advances.global_router)
app.include_router(mileage.router)
app.include_router(app_settings.router)
app.include_router(dashboard.router)
app.include_router(ocr.router)
app.include_router(signature.router)
app.include_router(ldap_router.router)
app.include_router(email_settings_router.router)
app.include_router(imap_settings_router.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
