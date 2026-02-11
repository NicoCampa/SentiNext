# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the SentiNext desktop backend sidecar."""

import os
import sys
from pathlib import Path

block_cipher = None

# Paths
spec_dir = os.path.dirname(os.path.abspath(SPEC))
repo_root = os.path.abspath(os.path.join(spec_dir, '..', '..', '..'))
api_dir = os.path.join(repo_root, 'apps', 'api')
desktop_dir = os.path.join(repo_root, 'apps', 'desktop')

a = Analysis(
    [os.path.join(spec_dir, 'desktop_main.py')],
    pathex=[repo_root, api_dir],
    binaries=[],
    datas=[
        # Include Jinja2 templates for reports
        (os.path.join(api_dir, 'senti_next', 'templates'), 'senti_next/templates'),
    ],
    hiddenimports=[
        # uvicorn internals
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # SQLAlchemy dialects
        'sqlalchemy.dialects.sqlite',
        # App modules
        'apps.api.main',
        'apps.api.senti_next',
        'apps.api.senti_next.storage',
        'apps.api.senti_next.db',
        'apps.api.senti_next.dialect',
        'apps.api.senti_next.llm',
        'apps.api.senti_next.steam_api',
        'apps.api.senti_next.insights',
        'apps.api.senti_next.chat',
        'apps.api.senti_next.chat_agent',
        'apps.api.senti_next.chat_tools',
        'apps.api.senti_next.reports',
        'apps.api.senti_next.analysis',
        'apps.api.senti_next.ingest',
        'apps.api.senti_next.intent',
        'apps.api.senti_next.jobs',
        'apps.api.senti_next.models',
        'apps.api.senti_next.circuit_breaker',
        'apps.api.senti_next.redis_client',
        'apps.api.senti_next.logging_config',
        'apps.api.senti_next.routes',
        'apps.api.senti_next.routes.analysis',
        'apps.api.senti_next.routes.games',
        'apps.api.senti_next.routes.reviews',
        'apps.api.senti_next.routes.chat',
        'apps.api.senti_next.routes.settings',
        'apps.api.senti_next.routes.misc',
        'apps.api.senti_next.routes._shared',
        'apps.api.senti_next.routes._guards',
        'apps.api.senti_next.providers',
        'apps.api.senti_next.providers.base',
        'apps.api.senti_next.providers.gemini',
        'apps.api.senti_next.providers.xai',
        'apps.api.senti_next.providers.openai_compat',
        'apps.api.senti_next.providers.config',
        # LLM SDKs
        'openai',
        'google.genai',
        # Other
        'platformdirs',
        'dotenv',
        'reportlab',
        'jinja2',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'weasyprint',
        'psycopg2',
        'redis',
        'rq',
        'sentry_sdk',
        'alembic',
        'pytest',
        'tkinter',
        'matplotlib',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='sentinext-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='sentinext-backend',
)
