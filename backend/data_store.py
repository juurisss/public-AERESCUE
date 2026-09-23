import json
import re
from datetime import datetime, timezone
from pathlib import Path


DATA_CATEGORIES = (
    "target-localization",
    "tracking-summary",
    "tracking-observations",
    "reacquisition-events",
    "relative-distance",
    "guidance",
)

SESSION_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$")


def utcNow():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validSessionId(sessionId):
    return bool(isinstance(sessionId, str) and SESSION_ID_RE.fullmatch(sessionId))


def sessionDir(dataDir, sessionId):
    return Path(dataDir) / sessionId


def readJson(path, default):
    try:
        with Path(path).open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default


def writeJson(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.replace(path)


def sessionPayload(dataDir, sessionId):
    directory = sessionDir(dataDir, sessionId)
    payload = {"metadata": readJson(directory / "metadata.json", {})}
    for category in DATA_CATEGORIES:
        payload[category] = readJson(directory / f"{category}.json", [])
    return payload


def trialIdExists(directory, trialId, category):
    if not trialId:
        return False

    for other in DATA_CATEGORIES:
        if {category, other} == {"tracking-summary", "tracking-observations"}:
            continue
        records = readJson(Path(directory) / f"{other}.json", [])
        if any(record.get("trialId") == trialId
               for record in records if isinstance(record, dict)):
            return True

    return False
