"""FastAPI main application — Attendance & Payroll System.

Assembles all routers and starts background workers via APScheduler.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import get_settings
from app.routers import employees, attendance, overrides, payroll, devices, payslip, sync, holidays, adms, auth, employee_portal, leaves, users

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# APScheduler instance
scheduler = AsyncIOScheduler()


async def _run_session_builder_job():
    """Scheduled job: Session Builder Worker (every 30s)."""
    try:
        from app.workers.session_builder import run_session_builder
        await run_session_builder()
    except Exception as e:
        logger.error(f"Session Builder job error: {e}")


async def _run_auto_checkout_job():
    """Scheduled job: Auto Checkout Worker (every 15 min)."""
    try:
        from app.workers.auto_checkout import run_auto_checkout
        await run_auto_checkout()
    except Exception as e:
        logger.error(f"Auto Checkout job error: {e}")

async def _run_device_poller_job():
    """Scheduled job: Device Poller Worker (every 60s)."""
    try:
        from app.workers.device_poller import run_device_poller
        await run_device_poller()
    except Exception as e:
        logger.error(f"Device Poller job error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start/stop background workers."""
    logger.info("🚀 Starting Attendance & Payroll System")

    # Start scheduled workers
    scheduler.add_job(_run_session_builder_job, "interval", seconds=30, id="session_builder")
    scheduler.add_job(_run_auto_checkout_job, "interval", minutes=15, id="auto_checkout")
    
    settings = get_settings()
    scheduler.add_job(_run_device_poller_job, "interval", seconds=settings.device_poll_interval_seconds, id="device_poller")
    
    scheduler.start()
    logger.info(f"⏰ Background workers started (Session Builder: 30s, Auto Checkout: 15m, Device Poller: {settings.device_poll_interval_seconds}s)")

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    logger.info("👋 Shutting down")


# Create FastAPI app
app = FastAPI(
    title="Attendance & Payroll System",
    description=(
        "Biometric attendance tracking and payroll system for a small eye hospital. "
        "Handles eSSL/ZKTeco device integration, session pairing, auto-checkout, "
        "admin corrections (overrides), recalculation, and payroll computation."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://attendance-sigma-one.vercel.app",
        "https://novus-comply.vercel.app", # added just in case
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(adms.router)  # ADMS push protocol — mounted at root (device expects /iclock/cdata)
app.include_router(employees.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(overrides.router, prefix="/api")
app.include_router(payroll.router, prefix="/api")
app.include_router(payslip.router, prefix="/api")
app.include_router(devices.router, prefix="/api")
app.include_router(sync.router, prefix="/api")
app.include_router(holidays.router, prefix="/api")
app.include_router(auth.router)
app.include_router(employee_portal.router)
app.include_router(leaves.router)
app.include_router(users.router)


@app.get("/")
async def root():
    return {
        "system": "Attendance & Payroll System",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health")
async def health_check():
    """System health check."""
    from app.database import get_supabase
    try:
        db = get_supabase()
        # Quick DB check
        db.table("system_config").select("key").limit(1).execute()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {e}"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "scheduler": "running" if scheduler.running else "stopped",
        "workers": {
            "session_builder": "active (30s interval)",
            "auto_checkout": "active (15m interval)",
            "device_poller": f"active ({get_settings().device_poll_interval_seconds}s interval)",
        },
    }


@app.get("/api/system-config")
async def get_system_config():
    """Get system configuration."""
    db = get_supabase()
    result = db.table("system_config").select("*").execute()
    return {item["key"]: item["value"] for item in (result.data or [])}


@app.put("/api/system-config/{key}")
async def update_system_config(key: str, value: dict):
    """Update a system config value."""
    from app.database import get_supabase
    db = get_supabase()
    db.table("system_config").upsert({
        "key": key,
        "value": value.get("value"),
        "updated_at": "now()",
    }).execute()
    return {"message": f"Config '{key}' updated"}
