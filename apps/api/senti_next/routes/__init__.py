"""FastAPI APIRouter modules for the SentiNext backend."""

from .analysis import router as analysis_router
from .games import router as games_router
from .reviews import router as reviews_router
from .chat import router as chat_router
from .settings import router as settings_router
from .misc import router as misc_router

all_routers = [
    analysis_router,
    games_router,
    reviews_router,
    chat_router,
    settings_router,
    misc_router,
]
