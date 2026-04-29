from __future__ import annotations

import hashlib
import json
import posixpath
import re
import shutil
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SPREADSHEET_ID = "1AR_GGH4EJIqAC73Z1dmM24xd9rgQsjG9PQqL4fCJ3Bg"
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=xlsx"

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TMP_DIR = PROJECT_ROOT / "tools" / "tmp"
GENERATED_DIR = PROJECT_ROOT / "src" / "generated"
PUBLIC_LOGO_DIR = PROJECT_ROOT / "public" / "generated" / "mmm-source-logos"
PUBLIC_PLAYER_FLAG_DIR = PROJECT_ROOT / "public" / "generated" / "mmm-player-flags"
VENDORED_FLAG_DIR = PROJECT_ROOT / "tools" / "vendor" / "world-flags" / "png64"
MANUAL_ASSET_DIR = PROJECT_ROOT / "tools" / "manual-assets"
OUTPUT_JSON = GENERATED_DIR / "mmm-spreadsheet-source-data.json"
OUTPUT_JS = PROJECT_ROOT / "api" / "_lib" / "static-mmm-snapshot.js"
WORKBOOK_PATH = TMP_DIR / "mmm-source-sheet.xlsx"
DIGS_INDIVIDUAL_WORLD_COL_START = 11  # K
DIGS_INDIVIDUAL_WORLD_COL_END = 24  # X

MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
DRAWING_NS = "{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}"
A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

PLAYER_FLAG_CODE_BY_HASH = {
    "0e0df661cf0e43e1f1b98a877b9f213c": "pe",
    "1a35b31eb6acc4207212fbbf8b68c993": "jp",
    "1cc02505fa2594153280c66eb5ac6880": "ie",
    "240599f1f1d5b602b6dfe60700f4b2e4": "ru",
    "2860df1c20dd44007fac31391cdb4982": "fr",
    "2f5e5f6c3b30a4ae56b107c529374f68": "gb",
    "326e73a17c8a44d3c36f1737c99bf8a0": "co",
    "3446232026da5e3cc76746be5c5dc320": "vn",
    "37cb9b3fefee88cdd12edc0c575ae005": "cz",
    "3b335e36ec045c47469e8c662345153f": "cl",
    "490036a1eee2ec75d37af0b2d85cb06d": "ar",
    "59d97d7556cae52747979a7c56b1e7c3": "ee",
    "5afa85abc2f6bea40bde0c14c0034fbb": "cn",
    "652ffc3f3509940a15151f9297444551": "hu",
    "6d2ffeb7dfd460f166a45c47a3a5d759": "ca",
    "7bc8dadf88e0a69ceac0cfdc730b3269": "cr",
    "89192889f5c3a09ffd5addeb4272e820": "br",
    "8998bf5d6a0d41116e699df7c38599c4": "pt",
    "8a6c5cecc4490206436c6265fb5781d8": "il",
    "ab7c0f36f367bf1f4cd1cea5e0fd17d8": "dk",
    "abd6c3e9b807c8267ec821edff1dc74b": "ni",
    "b560d178e566a3ab86e3982f29ea8dc1": "gt",
    "b8f504453496eaa7a753b5508feb3335": "de",
    "be0c5a2ab0b1558d17336146ae7612a0": "mx",
    "c1da7410c83bde60588812191571becd": "es",
    "cd43e99044aa44bca52a27e5b5ea52a2": "nl",
    "cf0a9b039b0707f615705c7a86c83038": "us",
    "cfd3a144ac651e11936bcb98b38048ef": "bt",
    "d0add0e3c4f019b0f30a24f5be1503cf": "pl",
    "d36df9532fe818640e84f25c4c92c6b1": "fi",
    "e4e8589c01080612fb6b7fad20f2cbf5": "au",
    "e5a83bd13cac7c310dab1533757e8538": "se",
    "e5ed4e5d690444082039b464ddaa258d": "si",
    "f3d428c39cfc42d2602e2e6614479ff4": "sv",
    "f6c7a0ce49a167433e35f34c2e76ef05": "it",
    "f7b4cf76fe4a5926e04492a15814fea5": "be",
    "fa2bd28803b459f4340de326dd1638f5": "uy",
    "fde8d42947a059bfeb139a6178b84c0d": "hn",
}

STARWIRE_SOURCE_ID = "digs:f461dd133f654306a840a923b2cd91a3"
STARWIRE_SOURCE_SLUG = "starwire"
STARWIRE_SOURCE_NAME = "Starwire"
STARWIRE_PLAYER_TOTALS = {
    "twiti888": 537765,
    "OfflineWifi": 131478,
    "HJonk_We_Goos": 53828,
    "GaraiBence": 28267,
    "VideoPlaying89": 49442,
    "Towppe": 38214,
    "WOFU_IS_ME": 15901,
    "wofu": 12506,
    "Fresh_Artz": 7639,
    "2mojang": 5561,
    "_WOFU": 5282,
    "CombatTerrifying": 4916,
    "Squze": 4006,
    "Oriol_Cubeles": 379,
    "DH12043": 64,
    "iSophes": 7,
}
STARWIRE_TOTAL_BLOCKS = 895255

CUBUSFERA_SOURCE_ID = "digs:e38821c215587ff4a57d25922c867d5f"
CUBUSFERA_SOURCE_SLUG = "cubusfera"
CUBUSFERA_SOURCE_NAME = "Cubusfera"
CUBUSFERA_PLAYER_TOTALS = {
    "asanchezdom": 112699,
    "samuKING": 101362,
    "SrMakrein": 97908,
    "JJ99_": 23078,
    "Cferreiras": 21478,
    "vegetinES": 20841,
    "ElMercuriano": 17216,
    "KenozzZ": 15946,
    "DON_MARTO": 15421,
    "alexxzdev": 2626,
    "Zeta7100": 1112,
    "ArcaneNexusYT": 108,
    "sutrolimpio": 28,
}
CUBUSFERA_TOTAL_BLOCKS = 429823

INFINITY_SOURCE_ID = "digs:5a42e79d3cab23388bb8841591f9078d"
INFINITY_SOURCE_SLUG = "infinity"
INFINITY_SOURCE_NAME = "Infinity"
INFINITY_PLAYER_TOTALS = {
    "JerboaWings": 48522,
    "Smugless": 20899,
    "Confusing": 14196,
    "Bobisawesome07": 4691,
    "Ekemu!": 1292,
    "MouldyWBread": 1021,
    "TheOldSteve": 387,
    "AdminInfinity": 363,
    "b0nüüü": 327,
    "_Interplanetary_": 217,
    "Berlii": 17,
}
INFINITY_TOTAL_BLOCKS = 91932

ONLYCARTS_SOURCE_ID = "digs:f4894c84c02b1e736203a6b9f8654e51"
ONLYCARTS_SOURCE_SLUG = "onlycarts"
ONLYCARTS_SOURCE_NAME = "OnlyCarts"
ONLYCARTS_PLAYER_TOTALS = {
    "zeithr": 26430,
    "Haaaaaaa": 25077,
    "Bldhf": 6948,
    "enkvadrat": 4703,
    "maxelden1": 402,
    "vytross": 371,
    "SandCaribou1890": 24,
    "Pi3tro_88": 10,
}
ONLYCARTS_TOTAL_BLOCKS = 63965

REDACTED_SOURCE_ID = "digs:59cbeb3a20fcbabaf20048414d92ae7a"
REDACTED_SOURCE_SLUG = "redacted"
REDACTED_SOURCE_NAME = "[REDACTED]"
REDACTED_PLAYER_TOTALS = {
    "Kayzm": 114100,
    "Coltzy": 102965,
    "au_Crimmy": 24089,
    "Bobisawesome07": 16183,
    "otheStyle": 10659,
    "sskyzy": 4468,
    "auraaXXX": 4439,
    "Squikkzy": 4327,
    "Rodentus_01_": 738,
    "Rt5H3": 468,
    "Kizuyuuu": 250,
    "SandCaribou1890": 9,
    "H4CK0S": 4,
}
REDACTED_TOTAL_BLOCKS = 282699

GATEWAY_TECH_SOURCE_ID = "digs:2f0a3a5676e48fedcf1f341c0475ecc0"
GATEWAY_TECH_SOURCE_SLUG = "gateway-tech"
GATEWAY_TECH_SOURCE_NAME = "Gateway Tech"
GATEWAY_TECH_PLAYER_TOTALS = {
    "Lazy_Perfection": 167342,
    "XoII": 47190,
    "OzerM6": 6567,
    "Bodilingus": 2724,
    "MrQuab": 2256,
    "NomisGamer": 796,
    "Vipirion7": 368,
}
GATEWAY_TECH_TOTAL_BLOCKS = 227243

HAZETECH_SOURCE_ID = "digs:f19d701241c6117033505c1fbcd86e93"
HAZETECH_SOURCE_SLUG = "hazetech"
HAZETECH_SOURCE_NAME = "HazeTech"
HAZETECH_PLAYER_TOTALS = {
    "Toxmi": 250861,
    "Asana_11": 229704,
    "Sivior": 105506,
    "Itz_Grpe": 74950,
    "edo9_thebigdog": 74145,
    "TopazTheCorgi": 71174,
    "xDov": 33334,
    "Ka_jmil": 26420,
    "TheGremlinx": 19404,
    "sskyzy": 9672,
    "Etikle": 7009,
    "wires4bones": 1159,
    "offroadtrucker3": 210,
    "ConnectNote": 132,
}
HAZETECH_TOTAL_BLOCKS = 905680

COSMOTECH_SOURCE_ID = "digs:03a8a5823ce51e928b4f452d5bae6398"
COSMOTECH_SOURCE_SLUG = "cosmotech"
COSMOTECH_SOURCE_NAME = "CosmoTech"

POWERTECH_SOURCE_ID = "digs:fab4281c0464b731fcc12f4950b054d4"
POWERTECH_SOURCE_SLUG = "powertech"
POWERTECH_SOURCE_NAME = "PowerTech"
POWERTECH_PLAYER_TOTALS = {
    "The_Bjoel2": 269397,
    "KBnC_MEN": 268851,
    "xCashyastar": 100900,
    "sainty4207": 55464,
    "TansBro1": 23713,
    "Severalpilot4310": 16968,
    "shxtn_": 9718,
    "Bobisawesome07": 63,
    "Myrebtw": 52,
    "Iten7shot": 31,
    "FaunSuperior8": 1,
}
POWERTECH_TOTAL_BLOCKS = 743158

BREADSMP_SOURCE_ID = "digs:987727b56ba9e22e1d19a1dca1315903"
BREADSMP_SOURCE_SLUG = "breadsmp"
BREADSMP_SOURCE_NAME = "BreadSMP"
BREADSMP_PLAYER_TOTALS = {
    "lukepourquoi": 315579,
    "JustPrez": 60579,
    "GaRLic_BrEd_": 56694,
    "Al306": 18506,
    "PentaSteve": 10976,
    "NotAless50": 6675,
    "johnyElgamer": 2581,
    "SatsuJintako": 549,
    "Obi0081_": 196,
    "in_a_box": 169,
    "InventorPWB": 4,
}
BREADSMP_TOTAL_BLOCKS = 472508

AQUATECH_SOURCE_ID = "digs:13ae916fbcb0fcb67a8068d46e1ce884"
AQUATECH_SOURCE_SLUG = "aquatech"
AQUATECH_SOURCE_NAME = "AquaTech"
AQUATECH_PLAYER_TOTALS = {
    "SwhicHD": 456800,
    "Isaacw24": 79164,
    "Velade": 72907,
    "marcmiller101": 72565,
    "Squibid": 51285,
    "cherrybunny_": 50316,
    "NEERGWEY": 35086,
    "JALSthedestroyer": 32783,
    "trytryw": 22363,
    "SullyMG": 19881,
    "John_Sheppard141": 16353,
    "flowzz_": 13765,
    "TheOdddsy": 8640,
    "tpower2008": 6883,
}
AQUATECH_TOTAL_BLOCKS = 951791

PHOENIX_SOURCE_ID = "digs:4313adac9896eb88f412331a9cdb8126"
PHOENIX_SOURCE_SLUG = "phoenix"
PHOENIX_SOURCE_NAME = "Phoenix"
PHOENIX_PLAYER_TOTALS = {
    "5hekel": 1296136,
    "geno54321": 802833,
    "Xiphosal": 800000,
    "10Down": 644107,
    "TheMaster_Fox": 457541,
    "Qdeam": 450368,
    "guymer_": 407031,
    "Elysiumfire": 326180,
    "Wavyfloor": 174618,
    "Sajoc1": 172299,
    "King2347": 122316,
    "Zybyte85": 101828,
    "Krayiken_": 95784,
    "Zyvin": 69420,
    "x8Ghost": 50091,
}
PHOENIX_TOTAL_BLOCKS = 5976552

DUGRIFT_SOURCE_ID = "digs:4488e7920dc18138121e9d4ca7ea7662"
DUGRIFT_SOURCE_SLUG = "dugrift-smp"
DUGRIFT_SOURCE_NAME = "DugRift SMP"
DUGRIFT_LOGO_FILENAME = "dugrift-smp.png"
DUGRIFT_LOGO_SOURCE_PATH = MANUAL_ASSET_DIR / DUGRIFT_LOGO_FILENAME
DUGRIFT_PLAYER_TOTALS = {
    "DouglasGordo": 7680441,
    "Tibsun": 5526940,
    "Grimdian": 1468256,
    "Blackivity": 824876,
    "PhotonJohn": 614807,
    "koemadnai": 86053,
    "MooseRef": 76407,
    "applesteak": 72688,
    "Niina30": 39172,
    "rosayasor": 1495,
    "Vilonty": 88,
}
DUGRIFT_TOTAL_BLOCKS = 16391223

HERMITCRAFT_SOURCE_ID = "private:316fade076eb88a64244bff155004bb2"
HERMITCRAFT_SOURCE_SLUG = "hermitcraft"
HERMITCRAFT_SOURCE_NAME = "Hermitcraft"
HERMITCRAFT_TOTAL_BLOCKS = 128707897
HERMITCRAFT_PLAYER_TOTALS = {
    "GoodTimeWithScar": 13140156,
    "cubfan135": 10938257,
    "joehillssays": 10009303,
    "falsesymmetry": 8652287,
    "Xisuma": 8609095,
    "Renthedog": 8225294,
    "impulseSV": 7129679,
    "Tango": 6922483,
    "iJevin": 5801188,
    "Grian": 5451386,
    "Mumbo": 4744004,
    "iskall85": 4188260,
    "xBCrafted": 3988614,
    "Docm77": 3723547,
    "Etho": 3203343,
    "Keralis1": 2711506,
    "hypnotized": 2306013,
    "PearlescentMoon": 2297347,
    "Welsknight": 2213651,
    "BdoubleO100": 1832074,
    "ZombieCleo": 1808867,
    "Stressmonster101": 1776988,
    "VintageBeef": 1716365,
    "Tinfoilchef": 1603873,
    "Zedaph": 1420906,
    "Smallishbeans": 718202,
    "GeminiTay": 632712,
    "PythonGB": 591828,
    "Biffa2001": 424590,
    "Skizzleman": 351133,
    "RentheKing": 233742,
    "sl1pg8r": 221374,
    "Spumwackles": 211563,
    "zueljin": 210322,
    "Pixlriffs": 183057,
    "topmass": 164110,
    "monkeyfarm": 125363,
    "KingDaddyDMAC": 121239,
    "MythicalSausage": 24982,
    "Jessassin": 18022,
    "HumanCleo": 16818,
    "skyzm": 14654,
    "NameOfSamuel": 5726,
    "Pungence": 4459,
    "EvilXisuma": 4051,
    "OrionSound": 2490,
    "ShubbleYT": 2162,
    "Collen": 2149,
    "Cojomax99": 1925,
    "Jura_Whitey": 1766,
    "SolidarityGaming": 685,
    "Smajor1995": 589,
    "PhoenixfireLune": 538,
    "fWhip": 520,
    "tterrag": 517,
    "Duke_da_dog": 418,
    "Mrs_Keralis": 378,
    "Helsknight": 232,
    "InTheLittleWood": 164,
    "PokePugx": 159,
    "Cleophas": 124,
    "isGall85": 110,
    "BarryBoss1234": 84,
    "pillbugnine": 84,
    "Eyjoy27": 81,
    "BadTimeWithScar": 40,
    "F1RECRACKER": 33,
    "HBomb94": 32,
    "jojosolos": 29,
    "LDShadowLady": 26,
    "Dot_Dot_Dash": 22,
    "STEAKFG": 21,
    "Firecracker1195": 16,
    "truesymmetry": 11,
    "aimsey": 11,
    "Couriway": 7,
    "xisumavoid": 6,
    "hannahxxrose": 6,
    "kingbdogz": 5,
    "CamM77": 4,
    "gnembon": 4,
    "JamalMC_": 4,
    "Biffa001": 3,
    "ImpulseCam": 3,
    "Grianch": 2,
    "Minerva246": 2,
    "slicedlime": 1,
    "belmarzi": 1,
}

BOBBYCRAFT_SOURCE_ID = "private:ffbfc97ddd2d529db61491608cf470c4"
BOBBYCRAFT_SOURCE_SLUG = "bobbycraft"
BOBBYCRAFT_SOURCE_NAME = "BobbyCraft"
BOBBYCRAFT_FIXED_TOTAL_BLOCKS = 38600000
BOBBYCRAFT_EXTRA_PLAYER = {
    "username": "CubeCraftPlayers",
    "blocksMined": 488894,
}

THANATOS_SOURCE_ID = "private:a8b3bee1a32afdef9a0fc1512b777e3c"
THANATOS_SOURCE_SLUG = "thanatos-smp"
THANATOS_SOURCE_NAME = "Thanatos SMP"
THANATOS_TOTAL_BLOCKS = 10305838
THANATOS_PLAYER_TOTALS = {
    "Aitorthek1ng": 3001430,
    "ImNako": 2387079,
    "SheronMan": 2146372,
    "akaNear": 520472,
    "RaCs55": 433866,
    "Just_a_R4ndom": 251620,
    "OmaOma03": 216106,
    "Vicenn06": 212304,
    "Kisde": 210099,
    "Ronambulo": 201061,
    "AironCrack": 121733,
    "CesarBBy": 117785,
    "RadiantFran": 63316,
    "galax_esp": 42836,
}

SOURCE_LABEL_OVERRIDES = {
    "digs:fd8eacc06e0b6386d2042bc56229df47": ("madincraft", "Madincraft"),
    "digs:9529b7aa7fed12cb18fc620c371837e2": ("triton", "Triton"),
    "digs:0886a38db7de5077dca1382c29ff02e4": ("90gq", "90gQ"),
    "digs:68b00713851620775a70dae2e1bb8a6f": ("iskall-patreon", "Iskall Patreon"),
    "digs:fa8d4d0a7922c1b1bb0ae00f131ca80c": ("lokamc", "LokaMC"),
    "digs:c8683321d1b4f0a3bb3e7aea0297127a": ("old-school-minecraft", "Old School Minecraft"),
    "digs:e567b5e05c56d3f4accbeea5d4c9f98c": ("stam-2", "STAM 2"),
    "digs:1fdc41661ad9e80b5ca86eae4472058e": ("thehomieserver", "TheHomieServer"),
    "digs:2d3c3578120e9f46bd47fad7a7fc04e8": ("dawnsmp", "DawnSMP"),
    "digs:b36176df2aa2194b95779b78b799b614": ("littleworlds-2", "Littleworlds 2"),
    "digs:27a95884edd24082e00d7f9d567d0da0": ("foundations-smp-2", "Foundations SMP 2"),
    "digs:b71682826726bee00b11ae176f40eec1": ("warrior", "Warrior"),
    "digs:bd2e73f23722fadae56186fcce7735b7": ("cynepbot-smp", "Cynepbot SMP"),
    "digs:4488e7920dc18138121e9d4ca7ea7662": ("dugrift-smp", "DugRift SMP"),
    "digs:683c3abd24cd8a7944e3d67c9a1d9bc0": ("6a6k", "6a6k"),
    "digs:96707a7af951f09151f94916ceb048cd": ("xyrosmp", "XyroSMP"),
}

REMOVED_SOURCE_IDS = {
    "digs:fe54648485320b18eb0bb48908e4e6e1",  # World Source 02 (Hermitcraft component)
    "digs:45f4992196249aa8c5354af08475035e",  # World Source 04 (Hermitcraft component)
    "digs:27173ba143e8cf86f5fe8151bb6c9412",  # World Source 05 (Hermitcraft component)
    "digs:6a430e3f358c7b03ac5aeeeb8728dad1",  # World Source 07 (Hermitcraft component)
    "digs:0a8d14f0b8d610222997a05a5fef92cc",  # World Source 10 (Hermitcraft component)
    "digs:2b9533a4e96f3ae04ab75dd163582ded",  # World Source 11 (Hermitcraft component)
    "digs:1db93fe320385dcb6998cf3ed5eba419",  # World Source 12 (Hermitcraft component)
    "digs:87be5c66a7f957b6a1dd9f7d8bb17d5f",  # World Source 18 (Hermitcraft component)
    "digs:b90b03eeeb5d10ddeb05751f49f0d6d7",  # World Source 29 (Hermitcraft component)
    "digs:df54077c94d889422fb778aa0d5e0dbb",  # World Source 32 (Hermitcraft component)
    "digs:9687097896577090101e7729180a69b6",  # World Source 36
    "digs:c3d0f54be14d767c7a9034bacf9cff9d",  # World Source 37
    "digs:23d25b237d5b134e99038187fda70f37",  # World Source 39
    "digs:fae354e7adc3f6fb17bd960bf977301e",  # Misspelled Thantos SMP duplicate
}



def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "source"


def clean_display_name(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def clean_player_display_name(value: Any) -> str:
    return re.sub(r"\s+\(new\)\s*$", "", clean_display_name(value), flags=re.IGNORECASE).strip()


def canonical_name(value: Any) -> str:
    return clean_player_display_name(value).lower()


def canonical_source_name(value: Any) -> str:
    return clean_display_name(value).lower()


def col_letter(column_number: int) -> str:
    result = ""
    current = column_number
    while current:
        current, remainder = divmod(current - 1, 26)
        result = chr(65 + remainder) + result
    return result


def norm_from_source(source_path: str, target: str) -> str:
    return posixpath.normpath(posixpath.join(posixpath.dirname(source_path), target))


def fetch_workbook() -> None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        EXPORT_URL,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        WORKBOOK_PATH.write_bytes(response.read())


def parse_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root.findall(f"{MAIN_NS}si"):
        parts = [text.text or "" for text in item.iterfind(f".//{MAIN_NS}t")]
        values.append("".join(parts))
    return values


def parse_workbook_sheet_targets(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
    rels_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_root}

    targets: dict[str, str] = {}
    for sheet in workbook_root.find(f"{MAIN_NS}sheets"):
        rel_id = sheet.attrib[f"{REL_NS}id"]
        targets[sheet.attrib["name"]] = f"xl/{rel_map[rel_id]}"
    return targets


def parse_sheet_cells(archive: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]) -> dict[str, Any]:
    root = ET.fromstring(archive.read(sheet_path))
    cells: dict[str, Any] = {}

    for cell in root.iterfind(f".//{MAIN_NS}c"):
        ref = cell.attrib["r"]
        cell_type = cell.attrib.get("t")
        value_node = cell.find(f"{MAIN_NS}v")

        if value_node is None:
            inline = cell.find(f"{MAIN_NS}is")
            if inline is None:
                continue
            parts = [text.text or "" for text in inline.iterfind(f".//{MAIN_NS}t")]
            cells[ref] = "".join(parts)
            continue

        raw = value_node.text or ""
        if cell_type == "s":
            cells[ref] = shared_strings[int(raw)]
            continue
        if cell_type == "str":
            cells[ref] = raw
            continue

        try:
            number = float(raw)
            cells[ref] = int(number) if number.is_integer() else number
        except ValueError:
            cells[ref] = raw

    return cells


@dataclass
class ImageAnchor:
    row: int
    col: int
    md5: str
    ext: str
    relative_logo_url: str


def extract_sheet_images(
    archive: zipfile.ZipFile,
    sheet_path: str,
    logo_file_by_hash: dict[str, str],
) -> dict[tuple[int, int], ImageAnchor]:
    rel_path = posixpath.join(posixpath.dirname(sheet_path), "_rels", f"{posixpath.basename(sheet_path)}.rels")
    if rel_path not in archive.namelist():
        return {}

    rel_root = ET.fromstring(archive.read(rel_path))
    drawing_target = None
    for rel in rel_root:
        if rel.attrib["Type"].endswith("/drawing"):
            drawing_target = rel.attrib["Target"]
            break

    if not drawing_target:
        return {}

    drawing_path = norm_from_source(sheet_path, drawing_target)
    drawing_root = ET.fromstring(archive.read(drawing_path))
    drawing_rel_path = posixpath.join(posixpath.dirname(drawing_path), "_rels", f"{posixpath.basename(drawing_path)}.rels")
    drawing_rel_root = ET.fromstring(archive.read(drawing_rel_path))
    drawing_rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in drawing_rel_root}

    anchors: dict[tuple[int, int], ImageAnchor] = {}

    for anchor in drawing_root:
        from_node = anchor.find(f"{DRAWING_NS}from")
        picture = anchor.find(f"{DRAWING_NS}pic")
        if from_node is None or picture is None:
            continue

        col = int(from_node.find(f"{DRAWING_NS}col").text) + 1
        row = int(from_node.find(f"{DRAWING_NS}row").text) + 1

        blip = picture.find(f".//{A_NS}blip")
        if blip is None:
            continue

        rel_id = blip.attrib[f"{REL_NS}embed"]
        media_path = norm_from_source(drawing_path, drawing_rel_map[rel_id])
        media_bytes = archive.read(media_path)
        md5 = hashlib.md5(media_bytes).hexdigest()
        ext = Path(media_path).suffix or ".png"

        if md5 not in logo_file_by_hash:
            logo_filename = f"{md5}{ext}"
            PUBLIC_LOGO_DIR.mkdir(parents=True, exist_ok=True)
            (PUBLIC_LOGO_DIR / logo_filename).write_bytes(media_bytes)
            logo_file_by_hash[md5] = logo_filename

        anchors[(row, col)] = ImageAnchor(
            row=row,
            col=col,
            md5=md5,
            ext=ext,
            relative_logo_url=f"/generated/mmm-source-logos/{logo_file_by_hash[md5]}",
        )

    return anchors


def number_or_none(value: Any) -> int | None:
    if value in (None, "", " "):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(float(str(value).strip()))
    except ValueError:
        return None


def parsed_block_count(value: Any) -> tuple[int | None, str | None]:
    if value in (None, "", " "):
        return None, "empty_world_dig"
    if isinstance(value, (int, float)):
        amount = int(value)
        return (amount, None) if amount > 0 else (None, "invalid_number")

    text = str(value).strip()
    if not text:
        return None, "empty_world_dig"
    if text in {"-", "–", "—", "n/a", "N/A"}:
        return None, "empty_world_dig"

    matches = re.findall(r"\d[\d,\s.]*", text)
    if not matches:
        return None, "invalid_number"

    numeric_text = re.sub(r"[\s,]", "", matches[0])
    try:
        amount = int(float(numeric_text))
    except ValueError:
        return None, "invalid_number"

    return (amount, None) if amount > 0 else (None, "invalid_number")


def integer_from_text(value: Any) -> int | None:
    if value in (None, "", " "):
        return None
    digits = re.sub(r"[^0-9]", "", str(value))
    if not digits:
        return None
    return int(digits)


def resolve_player_flag_url(image: ImageAnchor | None) -> str | None:
    if image is None:
        return None

    flag_code = PLAYER_FLAG_CODE_BY_HASH.get(image.md5)
    if not flag_code:
        return image.relative_logo_url

    source_path = VENDORED_FLAG_DIR / f"{flag_code}.png"
    if not source_path.exists():
        return image.relative_logo_url

    PUBLIC_PLAYER_FLAG_DIR.mkdir(parents=True, exist_ok=True)
    target_filename = f"{image.md5}.png"
    target_path = PUBLIC_PLAYER_FLAG_DIR / target_filename
    if not target_path.exists():
        shutil.copyfile(source_path, target_path)

    return f"/generated/mmm-player-flags/{target_filename}"


def copy_manual_logo(filename: str, source_path: Path) -> str:
    if not source_path.exists():
        raise FileNotFoundError(f"Manual source logo not found: {source_path}")

    PUBLIC_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    target_path = PUBLIC_LOGO_DIR / filename
    shutil.copyfile(source_path, target_path)
    return f"/generated/mmm-source-logos/{filename}"


def record_ingestion_skip(
    log: dict[str, Any],
    reason: str,
    *,
    row: int,
    column: str,
    player: str | None = None,
    source_header: str | None = None,
    value: Any = None,
) -> None:
    log["skipped"][reason] += 1
    if len(log["samples"]) >= 150:
        return
    log["samples"].append(
        {
            "reason": reason,
            "cell": f"{column}{row}",
            "row": row,
            "column": column,
            "player": player,
            "sourceHeader": source_header,
            "value": value,
        }
    )


def digs_individual_value_columns(digs_cells: dict[str, Any]) -> list[int]:
    columns: list[int] = []
    for col in range(DIGS_INDIVIDUAL_WORLD_COL_START, DIGS_INDIVIDUAL_WORLD_COL_END + 1):
        column = col_letter(col)
        for row in range(9, 1012):
            amount, _reason = parsed_block_count(digs_cells.get(f"{column}{row}"))
            if amount is not None:
                columns.append(col)
                break
    return columns


def digs_individual_source_name(digs_cells: dict[str, Any], value_col: int, icon_col: int) -> str | None:
    value_header = clean_display_name(digs_cells.get(f"{col_letter(value_col)}8"))
    icon_header = clean_display_name(digs_cells.get(f"{col_letter(icon_col)}8"))
    group_header = clean_display_name(digs_cells.get(f"{col_letter(DIGS_INDIVIDUAL_WORLD_COL_START)}8"))
    header = value_header or icon_header or group_header
    if not header:
        return None

    slot = ((max(icon_col, DIGS_INDIVIDUAL_WORLD_COL_START) - DIGS_INDIVIDUAL_WORLD_COL_START) // 2) + 1
    if header == group_header and group_header:
        return f"{group_header} {slot:02d}"
    return header


def add_digs_individual_world_backfill(
    *,
    digs_cells: dict[str, Any],
    digs_images: dict[tuple[int, int], ImageAnchor],
    sources: dict[str, dict[str, Any]],
    ssphsp_source_map: dict[Any, dict[str, Any]],
    spreadsheet_player_by_key: dict[str, dict[str, Any]],
    ambiguous_hashes: set[str | None],
) -> dict[str, Any]:
    log: dict[str, Any] = {
        "source": "Digs!I and Digs!K:X",
        "columns": "K:X",
        "added": 0,
        "updated": 0,
        "migratedFromLegacy": 0,
        "skipped": defaultdict(int),
        "samples": [],
    }

    value_columns = digs_individual_value_columns(digs_cells)
    log["valueColumns"] = [col_letter(col) for col in value_columns]

    existing_source_rows: set[tuple[str, str]] = set()
    for source in sources.values():
        source_id = str(source.get("id") or "")
        for row in source.get("players", {}).values():
            player_key = canonical_name(row.get("username"))
            if source_id and player_key:
                existing_source_rows.add((source_id, player_key))

    special_pair_index: dict[tuple[str, str], tuple[Any, dict[str, Any], dict[str, Any]]] = {}
    special_slot_index: dict[tuple[str, str], tuple[Any, dict[str, Any], dict[str, Any]]] = {}
    legacy_rows_by_player: dict[str, list[tuple[int, Any, dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for map_key, source in ssphsp_source_map.items():
        source_name = str(source.get("displayName") or "")
        source_id = str(source.get("id") or "")
        source_slot = ""
        source_slot_order = 10_000
        if source_id.startswith("special:ssp-hsp:") and not source_id.startswith("special:ssp-hsp:digs:"):
            source_slot = source_id.rsplit(":", 1)[-1].lower()
            source_slot_order = sum((ord(char) - 96) * (26 ** index) for index, char in enumerate(reversed(source_slot)))
        for row in source.get("rows", []):
            player_key = canonical_name(row.get("username"))
            row_source_name = clean_display_name(row.get("sourceServer") or source_name)
            if player_key and row_source_name:
                special_pair_index.setdefault((player_key, canonical_source_name(row_source_name)), (map_key, source, row))
            if player_key and source_slot:
                special_slot_index.setdefault((player_key, source_slot), (map_key, source, row))
                legacy_rows_by_player[player_key].append((source_slot_order, map_key, source, row))

    for entries in legacy_rows_by_player.values():
        entries.sort(key=lambda entry: entry[0])

    def remove_special_row(map_key: Any, source: dict[str, Any], row_ref: dict[str, Any]) -> None:
        rows = source.get("rows", [])
        try:
            rows.remove(row_ref)
        except ValueError:
            rows[:] = [
                row
                for row in rows
                if row is not row_ref
                and canonical_name(row.get("username")) != canonical_name(row_ref.get("username"))
            ]
        if rows:
            return
        ssphsp_source_map.pop(map_key, None)

    for row in range(9, 1012):
        raw_player = digs_cells.get(f"I{row}")
        player_name = clean_player_display_name(raw_player)
        player_key = canonical_name(player_name)

        for value_col in value_columns:
            column = col_letter(value_col)
            raw_value = digs_cells.get(f"{column}{row}")
            amount, reason = parsed_block_count(raw_value)
            if amount is None:
                record_ingestion_skip(log, reason or "invalid_number", row=row, column=column, player=player_name or None, value=raw_value)
                continue

            if not player_key:
                record_ingestion_skip(log, "empty_player", row=row, column=column, value=raw_value)
                continue

            icon_col = value_col - 1 if value_col > DIGS_INDIVIDUAL_WORLD_COL_START else value_col
            source_name = digs_individual_source_name(digs_cells, value_col, icon_col)
            if not source_name:
                record_ingestion_skip(log, "missing_invalid_source_header", row=row, column=column, player=player_name, value=raw_value)
                continue

            source_slot = col_letter(icon_col).lower()
            image = digs_images.get((row, icon_col))
            logo_hash = image.md5 if image else None
            existing_source_id = None
            if logo_hash:
                private_id = f"private:{logo_hash}"
                digs_id = f"digs:{logo_hash}"
                if private_id in sources:
                    existing_source_id = private_id
                elif digs_id in sources and logo_hash not in ambiguous_hashes:
                    existing_source_id = digs_id

            source_pair = (player_key, canonical_source_name(source_name))
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            source_slug = f"ssp-hsp-{slugify(player_name)}-{slugify(source_name)}"
            source_id = f"special:ssp-hsp:digs:{player_key}:{slugify(source_name)}"
            map_key = f"digs:{player_key}:{slugify(source_name)}"
            target_source = ssphsp_source_map.get(map_key)
            pair_entry = special_pair_index.get(source_pair)
            legacy_entry = special_slot_index.get((player_key, source_slot))
            if target_source is None and pair_entry:
                pair_source_id = str(pair_entry[1].get("id") or "")
                if pair_source_id.startswith("special:ssp-hsp:digs:"):
                    target_source = pair_entry[1]

            if target_source is None and existing_source_id and (existing_source_id, player_key) in existing_source_rows:
                record_ingestion_skip(
                    log,
                    "already_exists",
                    row=row,
                    column=column,
                    player=player_name,
                    source_header=source_name,
                    value=raw_value,
                )
                continue

            if target_source is None:
                legacy_queue = legacy_rows_by_player.get(player_key, [])
                while legacy_queue:
                    _slot_order, legacy_map_key, legacy_source, legacy_row = legacy_queue.pop(0)
                    if legacy_row in legacy_source.get("rows", []):
                        legacy_entry = (legacy_map_key, legacy_source, legacy_row)
                        break

            if target_source is None and legacy_entry is not None:
                legacy_map_key, legacy_source, legacy_row = legacy_entry
                remove_special_row(legacy_map_key, legacy_source, legacy_row)
                special_slot_index.pop((player_key, source_slot), None)
                target_source = None
                log["migratedFromLegacy"] += 1

            if target_source is None:
                target_source = {
                    "id": source_id,
                    "slug": source_slug,
                    "displayName": source_name,
                    "logoUrl": image.relative_logo_url if image else None,
                    "sourceType": "singleplayer",
                    "sourceScope": "ssp_hsp",
                    "sourceCategory": "ssp-hsp",
                    "sourceIdentity": "digs-tab-individual-world",
                    "sourceColumn": column,
                    "sourceHeaderCell": f"{col_letter(icon_col)}8",
                    "sourceSymbolHash": logo_hash,
                    "ownerPlayerId": player_meta.get("playerId", f"sheet:{player_key}"),
                    "ownerUsername": player_name,
                    "totalBlocks": 0,
                    "isDead": False,
                    "playerCount": 1,
                    "hasSpreadsheetTotal": False,
                    "needsManualReview": False,
                    "rows": [],
                }
                ssphsp_source_map[map_key] = target_source
                if legacy_entry is None:
                    log["added"] += 1
                else:
                    log["updated"] += 1
            else:
                target_source.update(
                    {
                        "id": source_id,
                        "slug": source_slug,
                        "displayName": source_name,
                        "logoUrl": image.relative_logo_url if image else target_source.get("logoUrl"),
                        "sourceType": "singleplayer",
                        "sourceScope": "ssp_hsp",
                        "sourceCategory": "ssp-hsp",
                        "sourceIdentity": "digs-tab-individual-world",
                        "sourceColumn": column,
                        "sourceHeaderCell": f"{col_letter(icon_col)}8",
                        "sourceSymbolHash": logo_hash,
                        "ownerPlayerId": player_meta.get("playerId", f"sheet:{player_key}"),
                        "ownerUsername": player_name,
                        "hasSpreadsheetTotal": False,
                        "needsManualReview": False,
                    }
                )
                log["updated"] += 1

            rows = target_source.setdefault("rows", [])
            rows[:] = [existing_row for existing_row in rows if canonical_name(existing_row.get("username")) != player_key]
            row_payload = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": player_name,
                "skinFaceUrl": player_meta.get("skinFaceUrl") or f"https://minotar.net/avatar/{urllib.parse.quote(player_name)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl") or resolve_player_flag_url(digs_images.get((row, 7))),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": amount,
                "totalDigs": amount,
                "rank": 1,
                "sourceServer": source_name,
                "sourceKey": f"{source_id}:{player_key}",
                "sourceCount": 1,
                "viewKind": "source",
                "sourceId": source_id,
                "sourceSlug": source_slug,
                "rowKey": f"{source_id}:{player_key}",
            }
            rows.append(row_payload)
            special_pair_index[source_pair] = (map_key, target_source, row_payload)
            special_slot_index[(player_key, source_slot)] = (map_key, target_source, row_payload)

    log["skipped"] = dict(sorted(log["skipped"].items()))
    return log


def rebuild_ssphsp_rows_from_sources(
    ssphsp_sources: list[dict[str, Any]],
    spreadsheet_player_by_key: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    player_totals: dict[str, dict[str, Any]] = {}
    player_source_ids: dict[str, set[str]] = defaultdict(set)

    for source in ssphsp_sources:
        source_id = str(source.get("id") or "")
        for row in source.get("rows", []):
            player_name = clean_player_display_name(row.get("username"))
            player_key = canonical_name(player_name)
            if not player_key:
                continue

            player_meta = spreadsheet_player_by_key.get(player_key, {})
            aggregate = player_totals.setdefault(
                player_key,
                {
                    "playerId": player_meta.get("playerId", row.get("playerId", f"sheet:{player_key}")),
                    "username": player_name,
                    "skinFaceUrl": player_meta.get("skinFaceUrl") or row.get("skinFaceUrl") or f"https://minotar.net/avatar/{urllib.parse.quote(player_name)}/32",
                    "playerFlagUrl": player_meta.get("playerFlagUrl") or row.get("playerFlagUrl"),
                    "lastUpdated": row.get("lastUpdated", "2026-04-21T00:00:00.000Z"),
                    "blocksMined": 0,
                    "totalDigs": 0,
                    "rank": 0,
                    "sourceServer": "SSP/HSP",
                    "sourceKey": f"ssphsp:{player_key}",
                    "sourceCount": 0,
                    "viewKind": "global",
                    "sourceId": "special:ssp-hsp",
                    "sourceSlug": "ssp-hsp",
                    "rowKey": f"ssphsp:{player_key}",
                },
            )
            amount = number_or_none(row.get("blocksMined")) or 0
            aggregate["blocksMined"] += amount
            aggregate["totalDigs"] += amount
            player_source_ids[player_key].add(source_id)

    rows = list(player_totals.values())
    for row in rows:
        player_key = canonical_name(row.get("username"))
        row["sourceCount"] = len(player_source_ids.get(player_key, set()))

    rows.sort(key=lambda item: (-item["blocksMined"], item["username"].lower()))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return rows


def build_snapshot() -> dict[str, Any]:
    fetch_workbook()

    if PUBLIC_LOGO_DIR.exists():
        shutil.rmtree(PUBLIC_LOGO_DIR)
    PUBLIC_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    if PUBLIC_PLAYER_FLAG_DIR.exists():
        shutil.rmtree(PUBLIC_PLAYER_FLAG_DIR)
    PUBLIC_PLAYER_FLAG_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(WORKBOOK_PATH) as archive:
        shared_strings = parse_shared_strings(archive)
        sheet_targets = parse_workbook_sheet_targets(archive)

        digs_cells = parse_sheet_cells(archive, sheet_targets["Digs"], shared_strings)
        single_world_cells = parse_sheet_cells(archive, sheet_targets["Single World Digs"], shared_strings)
        hardcore_cells = parse_sheet_cells(archive, sheet_targets["Hardcore Digs"], shared_strings)
        private_cells = parse_sheet_cells(archive, sheet_targets["Private Server Digs"], shared_strings)
        ssphsp_cells = parse_sheet_cells(archive, sheet_targets["SSPHSP Digs"], shared_strings)

        logo_file_by_hash: dict[str, str] = {}
        digs_images = extract_sheet_images(archive, sheet_targets["Digs"], logo_file_by_hash)
        single_world_images = extract_sheet_images(archive, sheet_targets["Single World Digs"], logo_file_by_hash)
        hardcore_images = extract_sheet_images(archive, sheet_targets["Hardcore Digs"], logo_file_by_hash)
        private_images = extract_sheet_images(archive, sheet_targets["Private Server Digs"], logo_file_by_hash)
        ssphsp_images = extract_sheet_images(archive, sheet_targets["SSPHSP Digs"], logo_file_by_hash)

    private_sources_by_hash: dict[str, dict[str, Any]] = {}
    for (row, col), image in private_images.items():
        if col != 8 or row < 9:
            continue

        name = str(private_cells.get(f"I{row}") or "").strip()
        if not name:
            continue

        total_blocks = number_or_none(private_cells.get(f"J{row}")) or 0
        is_dead = str(private_cells.get(f"K{row}") or "").strip().upper() == "D"
        private_sources_by_hash[image.md5] = {
            "id": f"private:{image.md5}",
            "slug": slugify(name),
            "displayName": name,
            "logoHash": image.md5,
            "logoUrl": image.relative_logo_url,
            "logoExt": image.ext,
            "sourceType": "server",
            "sourceScope": "private_server_digs",
            "totalBlocks": total_blocks,
            "isDead": is_dead,
            "players": {},
            "playerCount": 0,
            "hasSpreadsheetTotal": True,
            "needsFallbackName": False,
        }

    # Detect ambiguous logo hashes reused multiple times in the same Digs row.
    ambiguous_hashes: set[str | None] = set()
    player_slot_counts: dict[str, int] = {}
    for row in range(9, 1012):
        player_name = clean_player_display_name(digs_cells.get(f"I{row}"))
        if not player_name:
            continue

        row_hashes: Counter[str | None] = Counter()
        row_sources = 0
        for col in range(11, 88, 2):
            amount = number_or_none(digs_cells.get(f"{col_letter(col + 1)}{row}"))
            if amount is None:
                continue
            row_sources += 1
            row_hashes[digs_images.get((row, col)).md5 if digs_images.get((row, col)) else None] += 1

        player_slot_counts[canonical_name(player_name)] = row_sources
        for logo_hash, count in row_hashes.items():
            if count > 1:
                ambiguous_hashes.add(logo_hash)

    spreadsheet_players: list[dict[str, Any]] = []
    sources: dict[str, dict[str, Any]] = {item["id"]: item for item in private_sources_by_hash.values()}

    digs_only_entries: list[tuple[str, dict[str, Any]]] = []
    excluded_entries = 0

    for row in range(9, 1012):
        player_name = clean_player_display_name(digs_cells.get(f"I{row}"))
        total_blocks = number_or_none(digs_cells.get(f"J{row}"))
        if not player_name or total_blocks is None:
            continue

        player_key = canonical_name(player_name)
        spreadsheet_players.append(
            {
                "playerId": f"sheet:{player_key}",
                "username": player_name,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(player_name)}/32",
                "playerFlagUrl": resolve_player_flag_url(digs_images.get((row, 7))),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": "MMM Spreadsheet",
                "sourceKey": f"global:{player_key}",
                "sourceCount": player_slot_counts.get(player_key, 0),
                "viewKind": "global",
                "sourceId": None,
                "sourceSlug": None,
                "rowKey": f"global:{player_key}",
            }
        )

        seen_for_player: set[str] = set()
        strongest_source_name = None
        strongest_source_slug = None
        strongest_source_id = None
        strongest_blocks = -1

        for col in range(11, 88, 2):
            amount = number_or_none(digs_cells.get(f"{col_letter(col + 1)}{row}"))
            if amount is None:
                continue

            image = digs_images.get((row, col))
            logo_hash = image.md5 if image else None

            if logo_hash is None or (logo_hash in ambiguous_hashes and logo_hash not in private_sources_by_hash):
                excluded_entries += 1
                continue

            if logo_hash in private_sources_by_hash:
                source_id = f"private:{logo_hash}"
            else:
                source_id = f"digs:{logo_hash}"

                if source_id not in sources:
                    sources[source_id] = {
                        "id": source_id,
                        "slug": "",
                        "displayName": "",
                        "logoHash": logo_hash,
                        "logoUrl": image.relative_logo_url if image else None,
                        "logoExt": image.ext if image else ".png",
                        "sourceType": "world",
                        "sourceScope": "digs_logo_only",
                        "totalBlocks": 0,
                        "isDead": False,
                        "players": {},
                        "playerCount": 0,
                        "hasSpreadsheetTotal": False,
                        "needsFallbackName": True,
                    }

            source = sources[source_id]
            player_rows = source["players"]
            if player_key not in player_rows:
                player_rows[player_key] = {
                    "playerId": f"sheet:{player_key}",
                    "username": player_name,
                    "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(player_name)}/32",
                    "playerFlagUrl": resolve_player_flag_url(digs_images.get((row, 7))),
                    "lastUpdated": "2026-04-21T00:00:00.000Z",
                    "blocksMined": 0,
                    "totalDigs": 0,
                    "rank": 0,
                    "sourceServer": source["displayName"] or "Pending Source Name",
                    "sourceKey": f"{source_id}:{player_key}",
                    "sourceCount": player_slot_counts.get(player_key, 0),
                    "viewKind": "source",
                    "sourceId": source_id,
                    "sourceSlug": "",
                    "rowKey": f"{source_id}:{player_key}",
                }

            player_rows[player_key]["blocksMined"] += amount
            player_rows[player_key]["totalDigs"] += amount
            player_rows[player_key]["sourceServer"] = source["displayName"] or player_rows[player_key]["sourceServer"]
            if source_id not in seen_for_player:
                seen_for_player.add(source_id)
            if player_rows[player_key]["blocksMined"] > strongest_blocks:
                strongest_blocks = player_rows[player_key]["blocksMined"]
                strongest_source_name = source["displayName"]
                strongest_source_slug = source["slug"]
                strongest_source_id = source["id"]

        if strongest_source_name:
            spreadsheet_players[-1]["sourceServer"] = strongest_source_name
            spreadsheet_players[-1]["sourceSlug"] = strongest_source_slug
            spreadsheet_players[-1]["sourceId"] = strongest_source_id

    # Assign fallback names and totals for Digs-only sources.
    digs_only_sources = [source for source in sources.values() if source["needsFallbackName"]]
    digs_only_sources.sort(
        key=lambda item: (
            -sum(player["blocksMined"] for player in item["players"].values()),
            item["logoHash"],
        )
    )

    for index, source in enumerate(digs_only_sources, start=1):
        total_blocks = sum(player["blocksMined"] for player in source["players"].values())
        source["totalBlocks"] = total_blocks
        source["displayName"] = f"World Source {index:02d}"
        source["slug"] = f"world-source-{index:02d}"

    spreadsheet_player_by_key = {canonical_name(player["username"]): player for player in spreadsheet_players}

    starwire_source = sources.get(STARWIRE_SOURCE_ID)
    if starwire_source:
        starwire_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in STARWIRE_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            starwire_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": STARWIRE_SOURCE_NAME,
                "sourceKey": f"{STARWIRE_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": STARWIRE_SOURCE_ID,
                "sourceSlug": STARWIRE_SOURCE_SLUG,
                "rowKey": f"{STARWIRE_SOURCE_ID}:{player_key}",
            }

        if sum(row["blocksMined"] for row in starwire_rows.values()) != STARWIRE_TOTAL_BLOCKS:
            raise ValueError("Starwire total does not match the authoritative player total sum.")

        starwire_source["displayName"] = STARWIRE_SOURCE_NAME
        starwire_source["slug"] = STARWIRE_SOURCE_SLUG
        starwire_source["totalBlocks"] = STARWIRE_TOTAL_BLOCKS
        starwire_source["players"] = starwire_rows
        starwire_source["playerCount"] = len(starwire_rows)
        starwire_source["hasSpreadsheetTotal"] = True

    cubusfera_source = sources.get(CUBUSFERA_SOURCE_ID)
    if cubusfera_source:
        cubusfera_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in CUBUSFERA_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            cubusfera_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": CUBUSFERA_SOURCE_NAME,
                "sourceKey": f"{CUBUSFERA_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": CUBUSFERA_SOURCE_ID,
                "sourceSlug": CUBUSFERA_SOURCE_SLUG,
                "rowKey": f"{CUBUSFERA_SOURCE_ID}:{player_key}",
            }

        if sum(row["blocksMined"] for row in cubusfera_rows.values()) != CUBUSFERA_TOTAL_BLOCKS:
            raise ValueError("Cubusfera total does not match the authoritative player total sum.")

        cubusfera_source["displayName"] = CUBUSFERA_SOURCE_NAME
        cubusfera_source["slug"] = CUBUSFERA_SOURCE_SLUG
        cubusfera_source["totalBlocks"] = CUBUSFERA_TOTAL_BLOCKS
        cubusfera_source["players"] = cubusfera_rows
        cubusfera_source["playerCount"] = len(cubusfera_rows)
        cubusfera_source["hasSpreadsheetTotal"] = True

    infinity_source = sources.get(INFINITY_SOURCE_ID)
    if infinity_source:
        infinity_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in INFINITY_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            infinity_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": INFINITY_SOURCE_NAME,
                "sourceKey": f"{INFINITY_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": INFINITY_SOURCE_ID,
                "sourceSlug": INFINITY_SOURCE_SLUG,
                "rowKey": f"{INFINITY_SOURCE_ID}:{player_key}",
            }

        if sum(row["blocksMined"] for row in infinity_rows.values()) != INFINITY_TOTAL_BLOCKS:
            raise ValueError("Infinity total does not match the authoritative player total sum.")

        infinity_source["displayName"] = INFINITY_SOURCE_NAME
        infinity_source["slug"] = INFINITY_SOURCE_SLUG
        infinity_source["totalBlocks"] = INFINITY_TOTAL_BLOCKS
        infinity_source["players"] = infinity_rows
        infinity_source["playerCount"] = len(infinity_rows)
        infinity_source["hasSpreadsheetTotal"] = True

    onlycarts_source = sources.get(ONLYCARTS_SOURCE_ID)
    if onlycarts_source:
        onlycarts_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in ONLYCARTS_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            onlycarts_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": ONLYCARTS_SOURCE_NAME,
                "sourceKey": f"{ONLYCARTS_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": ONLYCARTS_SOURCE_ID,
                "sourceSlug": ONLYCARTS_SOURCE_SLUG,
                "rowKey": f"{ONLYCARTS_SOURCE_ID}:{player_key}",
            }

        if sum(row["blocksMined"] for row in onlycarts_rows.values()) != ONLYCARTS_TOTAL_BLOCKS:
            raise ValueError("OnlyCarts total does not match the authoritative player total sum.")

        onlycarts_source["displayName"] = ONLYCARTS_SOURCE_NAME
        onlycarts_source["slug"] = ONLYCARTS_SOURCE_SLUG
        onlycarts_source["totalBlocks"] = ONLYCARTS_TOTAL_BLOCKS
        onlycarts_source["players"] = onlycarts_rows
        onlycarts_source["playerCount"] = len(onlycarts_rows)
        onlycarts_source["hasSpreadsheetTotal"] = True

    redacted_source = sources.get(REDACTED_SOURCE_ID)
    if redacted_source:
        redacted_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in REDACTED_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            redacted_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": REDACTED_SOURCE_NAME,
                "sourceKey": f"{REDACTED_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": REDACTED_SOURCE_ID,
                "sourceSlug": REDACTED_SOURCE_SLUG,
                "rowKey": f"{REDACTED_SOURCE_ID}:{player_key}",
            }

        if sum(row["blocksMined"] for row in redacted_rows.values()) != REDACTED_TOTAL_BLOCKS:
            raise ValueError("[REDACTED] total does not match the authoritative player total sum.")

        redacted_source["displayName"] = REDACTED_SOURCE_NAME
        redacted_source["slug"] = REDACTED_SOURCE_SLUG
        redacted_source["totalBlocks"] = REDACTED_TOTAL_BLOCKS
        redacted_source["players"] = redacted_rows
        redacted_source["playerCount"] = len(redacted_rows)
        redacted_source["hasSpreadsheetTotal"] = True

    gateway_tech_source = sources.get(GATEWAY_TECH_SOURCE_ID)
    if gateway_tech_source:
        gateway_tech_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in GATEWAY_TECH_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            gateway_tech_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": GATEWAY_TECH_SOURCE_NAME,
                "sourceKey": f"{GATEWAY_TECH_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": GATEWAY_TECH_SOURCE_ID,
                "sourceSlug": GATEWAY_TECH_SOURCE_SLUG,
                "rowKey": f"{GATEWAY_TECH_SOURCE_ID}:{player_key}",
            }

        if sum(row["blocksMined"] for row in gateway_tech_rows.values()) != GATEWAY_TECH_TOTAL_BLOCKS:
            raise ValueError("Gateway Tech total does not match the authoritative filtered player total sum.")

        gateway_tech_source["displayName"] = GATEWAY_TECH_SOURCE_NAME
        gateway_tech_source["slug"] = GATEWAY_TECH_SOURCE_SLUG
        gateway_tech_source["totalBlocks"] = GATEWAY_TECH_TOTAL_BLOCKS
        gateway_tech_source["players"] = gateway_tech_rows
        gateway_tech_source["playerCount"] = len(gateway_tech_rows)
        gateway_tech_source["hasSpreadsheetTotal"] = True

    hazetech_source = sources.get(HAZETECH_SOURCE_ID)
    if hazetech_source:
        hazetech_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in HAZETECH_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            hazetech_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": HAZETECH_SOURCE_NAME,
                "sourceKey": f"{HAZETECH_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": HAZETECH_SOURCE_ID,
                "sourceSlug": HAZETECH_SOURCE_SLUG,
                "rowKey": f"{HAZETECH_SOURCE_ID}:{player_key}",
            }

        hazetech_source["displayName"] = HAZETECH_SOURCE_NAME
        hazetech_source["slug"] = HAZETECH_SOURCE_SLUG
        hazetech_source["totalBlocks"] = HAZETECH_TOTAL_BLOCKS
        hazetech_source["players"] = hazetech_rows
        hazetech_source["playerCount"] = len(hazetech_rows)
        hazetech_source["hasSpreadsheetTotal"] = True

    cosmotech_source = sources.get(COSMOTECH_SOURCE_ID)
    if cosmotech_source:
        cosmotech_source["displayName"] = COSMOTECH_SOURCE_NAME
        cosmotech_source["slug"] = COSMOTECH_SOURCE_SLUG

    powertech_source = sources.get(POWERTECH_SOURCE_ID)
    if powertech_source:
        powertech_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in POWERTECH_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            powertech_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": POWERTECH_SOURCE_NAME,
                "sourceKey": f"{POWERTECH_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": POWERTECH_SOURCE_ID,
                "sourceSlug": POWERTECH_SOURCE_SLUG,
                "rowKey": f"{POWERTECH_SOURCE_ID}:{player_key}",
            }

        powertech_source["displayName"] = POWERTECH_SOURCE_NAME
        powertech_source["slug"] = POWERTECH_SOURCE_SLUG
        powertech_source["totalBlocks"] = POWERTECH_TOTAL_BLOCKS
        powertech_source["players"] = powertech_rows
        powertech_source["playerCount"] = len(powertech_rows)
        powertech_source["hasSpreadsheetTotal"] = True

    breadsmp_source = sources.get(BREADSMP_SOURCE_ID)
    if breadsmp_source:
        breadsmp_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in BREADSMP_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            breadsmp_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": BREADSMP_SOURCE_NAME,
                "sourceKey": f"{BREADSMP_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": BREADSMP_SOURCE_ID,
                "sourceSlug": BREADSMP_SOURCE_SLUG,
                "rowKey": f"{BREADSMP_SOURCE_ID}:{player_key}",
            }

        if sum(row["blocksMined"] for row in breadsmp_rows.values()) != BREADSMP_TOTAL_BLOCKS:
            raise ValueError("BreadSMP total does not match the authoritative filtered player total sum.")

        breadsmp_source["displayName"] = BREADSMP_SOURCE_NAME
        breadsmp_source["slug"] = BREADSMP_SOURCE_SLUG
        breadsmp_source["totalBlocks"] = BREADSMP_TOTAL_BLOCKS
        breadsmp_source["players"] = breadsmp_rows
        breadsmp_source["playerCount"] = len(breadsmp_rows)
        breadsmp_source["hasSpreadsheetTotal"] = True

    aquatech_source = sources.get(AQUATECH_SOURCE_ID)
    if aquatech_source:
        aquatech_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in AQUATECH_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            aquatech_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": AQUATECH_SOURCE_NAME,
                "sourceKey": f"{AQUATECH_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": AQUATECH_SOURCE_ID,
                "sourceSlug": AQUATECH_SOURCE_SLUG,
                "rowKey": f"{AQUATECH_SOURCE_ID}:{player_key}",
            }

        aquatech_source["displayName"] = AQUATECH_SOURCE_NAME
        aquatech_source["slug"] = AQUATECH_SOURCE_SLUG
        aquatech_source["totalBlocks"] = AQUATECH_TOTAL_BLOCKS
        aquatech_source["players"] = aquatech_rows
        aquatech_source["playerCount"] = len(aquatech_rows)
        aquatech_source["hasSpreadsheetTotal"] = True

    phoenix_source = sources.get(PHOENIX_SOURCE_ID)
    if phoenix_source:
        phoenix_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in PHOENIX_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            phoenix_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": PHOENIX_SOURCE_NAME,
                "sourceKey": f"{PHOENIX_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": PHOENIX_SOURCE_ID,
                "sourceSlug": PHOENIX_SOURCE_SLUG,
                "rowKey": f"{PHOENIX_SOURCE_ID}:{player_key}",
            }

        phoenix_source["displayName"] = PHOENIX_SOURCE_NAME
        phoenix_source["slug"] = PHOENIX_SOURCE_SLUG
        phoenix_source["totalBlocks"] = PHOENIX_TOTAL_BLOCKS
        phoenix_source["players"] = phoenix_rows
        phoenix_source["playerCount"] = len(phoenix_rows)
        phoenix_source["hasSpreadsheetTotal"] = True

    dugrift_source = sources.get(DUGRIFT_SOURCE_ID)
    if dugrift_source:
        dugrift_rows: dict[str, dict[str, Any]] = {}
        for username, total_blocks in DUGRIFT_PLAYER_TOTALS.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            dugrift_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": DUGRIFT_SOURCE_NAME,
                "sourceKey": f"{DUGRIFT_SOURCE_ID}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": DUGRIFT_SOURCE_ID,
                "sourceSlug": DUGRIFT_SOURCE_SLUG,
                "rowKey": f"{DUGRIFT_SOURCE_ID}:{player_key}",
            }

        if sum(row["blocksMined"] for row in dugrift_rows.values()) != DUGRIFT_TOTAL_BLOCKS:
            raise ValueError("DugRift SMP total does not match the authoritative player total sum.")

        dugrift_source["displayName"] = DUGRIFT_SOURCE_NAME
        dugrift_source["slug"] = DUGRIFT_SOURCE_SLUG
        dugrift_source["logoUrl"] = copy_manual_logo(DUGRIFT_LOGO_FILENAME, DUGRIFT_LOGO_SOURCE_PATH)
        dugrift_source["totalBlocks"] = DUGRIFT_TOTAL_BLOCKS
        dugrift_source["players"] = dugrift_rows
        dugrift_source["playerCount"] = len(dugrift_rows)
        dugrift_source["hasSpreadsheetTotal"] = True

    bobbycraft_source = sources.get(BOBBYCRAFT_SOURCE_ID)
    if bobbycraft_source:
        username = BOBBYCRAFT_EXTRA_PLAYER["username"]
        total_blocks = BOBBYCRAFT_EXTRA_PLAYER["blocksMined"]
        player_key = username.lower()
        player_meta = spreadsheet_player_by_key.get(player_key, {})

        bobbycraft_source["players"][player_key] = {
            "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
            "username": username,
            "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
            "playerFlagUrl": player_meta.get("playerFlagUrl"),
            "lastUpdated": "2026-04-21T00:00:00.000Z",
            "blocksMined": total_blocks,
            "totalDigs": total_blocks,
            "rank": 0,
            "sourceServer": BOBBYCRAFT_SOURCE_NAME,
            "sourceKey": f"{BOBBYCRAFT_SOURCE_ID}:{player_key}",
            "sourceCount": player_meta.get("sourceCount", 1),
            "viewKind": "source",
            "sourceId": BOBBYCRAFT_SOURCE_ID,
            "sourceSlug": BOBBYCRAFT_SOURCE_SLUG,
            "rowKey": f"{BOBBYCRAFT_SOURCE_ID}:{player_key}",
        }
        bobbycraft_source["displayName"] = BOBBYCRAFT_SOURCE_NAME
        bobbycraft_source["slug"] = BOBBYCRAFT_SOURCE_SLUG
        bobbycraft_source["totalBlocks"] = BOBBYCRAFT_FIXED_TOTAL_BLOCKS
        bobbycraft_source["hasSpreadsheetTotal"] = True

    hermitcraft_source = sources.get(HERMITCRAFT_SOURCE_ID)
    if hermitcraft_source is None:
        hermitcraft_source = {
            "id": HERMITCRAFT_SOURCE_ID,
            "slug": HERMITCRAFT_SOURCE_SLUG,
            "displayName": HERMITCRAFT_SOURCE_NAME,
            "logoHash": None,
            "logoUrl": None,
            "logoExt": ".png",
            "sourceType": "server",
            "sourceScope": "private_server_digs",
            "totalBlocks": 0,
            "isDead": False,
            "players": {},
            "playerCount": 0,
            "hasSpreadsheetTotal": True,
            "needsFallbackName": False,
        }
        sources[HERMITCRAFT_SOURCE_ID] = hermitcraft_source

    hermitcraft_rows: dict[str, dict[str, Any]] = {}
    for username, total_blocks in HERMITCRAFT_PLAYER_TOTALS.items():
        player_key = username.lower()
        player_meta = spreadsheet_player_by_key.get(player_key, {})
        hermitcraft_rows[username] = {
            "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
            "username": username,
            "skinFaceUrl": player_meta.get("skinFaceUrl") or f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
            "playerFlagUrl": player_meta.get("playerFlagUrl"),
            "lastUpdated": "2026-04-21T00:00:00.000Z",
            "blocksMined": total_blocks,
            "totalDigs": total_blocks,
            "rank": 0,
            "sourceServer": HERMITCRAFT_SOURCE_NAME,
            "sourceKey": f"{HERMITCRAFT_SOURCE_ID}:{player_key}",
            "sourceCount": player_meta.get("sourceCount", 1),
            "viewKind": "source",
            "sourceId": HERMITCRAFT_SOURCE_ID,
            "sourceSlug": HERMITCRAFT_SOURCE_SLUG,
            "rowKey": f"{HERMITCRAFT_SOURCE_ID}:{player_key}",
        }

    if sum(row["blocksMined"] for row in hermitcraft_rows.values()) != HERMITCRAFT_TOTAL_BLOCKS:
        raise ValueError("Hermitcraft total does not match the authoritative player total sum.")

    hermitcraft_source["displayName"] = HERMITCRAFT_SOURCE_NAME
    hermitcraft_source["slug"] = HERMITCRAFT_SOURCE_SLUG
    hermitcraft_source["sourceType"] = "server"
    hermitcraft_source["sourceScope"] = "private_server_digs"
    hermitcraft_source["totalBlocks"] = HERMITCRAFT_TOTAL_BLOCKS
    hermitcraft_source["players"] = hermitcraft_rows
    hermitcraft_source["playerCount"] = len(hermitcraft_rows)
    hermitcraft_source["hasSpreadsheetTotal"] = True

    def apply_authoritative_source(
        source_id: str,
        source_slug: str,
        source_name: str,
        total_blocks: int,
        player_totals: dict[str, int],
        *,
        default_is_dead: bool = False,
    ) -> None:
        source = sources.get(source_id)
        if source is None:
            source = {
                "id": source_id,
                "slug": source_slug,
                "displayName": source_name,
                "logoHash": source_id,
                "logoUrl": None,
                "logoExt": ".png",
                "sourceType": "server",
                "sourceScope": "private_server_digs",
                "totalBlocks": 0,
                "isDead": default_is_dead,
                "players": {},
                "playerCount": 0,
                "hasSpreadsheetTotal": True,
                "needsFallbackName": False,
            }
            sources[source_id] = source

        source_rows: dict[str, dict[str, Any]] = {}
        for username, player_blocks in player_totals.items():
            player_key = username.lower()
            player_meta = spreadsheet_player_by_key.get(player_key, {})
            source_rows[player_key] = {
                "playerId": player_meta.get("playerId", f"sheet:{player_key}"),
                "username": username,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(username)}/32",
                "playerFlagUrl": player_meta.get("playerFlagUrl"),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": player_blocks,
                "totalDigs": player_blocks,
                "rank": 0,
                "sourceServer": source_name,
                "sourceKey": f"{source_id}:{player_key}",
                "sourceCount": player_meta.get("sourceCount", 1),
                "viewKind": "source",
                "sourceId": source_id,
                "sourceSlug": source_slug,
                "rowKey": f"{source_id}:{player_key}",
            }

        source["displayName"] = source_name
        source["slug"] = source_slug
        source["sourceType"] = "server"
        source["sourceScope"] = "private_server_digs"
        source["totalBlocks"] = total_blocks
        source["players"] = source_rows
        source["playerCount"] = len(source_rows)
        source["hasSpreadsheetTotal"] = True
        source["needsFallbackName"] = False

    apply_authoritative_source(
        THANATOS_SOURCE_ID,
        THANATOS_SOURCE_SLUG,
        THANATOS_SOURCE_NAME,
        THANATOS_TOTAL_BLOCKS,
        THANATOS_PLAYER_TOTALS,
        default_is_dead=True,
    )

    for source_id, (source_slug, source_name) in SOURCE_LABEL_OVERRIDES.items():
        source = sources.get(source_id)
        if source:
            source["slug"] = source_slug
            source["displayName"] = source_name

    # Finalize private sources and player rows.
    finalized_sources: list[dict[str, Any]] = []
    for source in sources.values():
        if not source["displayName"]:
            continue
        if source["id"] in REMOVED_SOURCE_IDS:
            continue

        rows = list(source["players"].values())
        rows.sort(key=lambda item: (-item["blocksMined"], item["username"].lower()))

        for rank, row in enumerate(rows, start=1):
            row["rank"] = rank
            row["sourceServer"] = source["displayName"]
            row["sourceSlug"] = source["slug"]

        if not source["hasSpreadsheetTotal"]:
            source["totalBlocks"] = sum(row["blocksMined"] for row in rows)

        source["playerCount"] = len(rows)
        finalized_sources.append(
            {
                "id": source["id"],
                "slug": source["slug"],
                "displayName": source["displayName"],
                "logoUrl": source["logoUrl"],
                "sourceType": source["sourceType"],
                "sourceScope": source["sourceScope"],
                "totalBlocks": source["totalBlocks"],
                "isDead": source["isDead"],
                "playerCount": source["playerCount"],
                "hasSpreadsheetTotal": source["hasSpreadsheetTotal"],
                "rows": rows,
            }
        )

    finalized_sources.sort(key=lambda item: (-item["totalBlocks"], item["displayName"].lower()))

    for rank, row in enumerate(sorted(spreadsheet_players, key=lambda item: (-item["blocksMined"], item["username"].lower())), start=1):
        row["rank"] = rank

    ssphsp_rows: list[dict[str, Any]] = []
    ssphsp_source_map: dict[Any, dict[str, Any]] = {}
    for row in range(9, 1012):
        player_name = clean_player_display_name(ssphsp_cells.get(f"I{row}"))
        if not player_name:
            continue

        total_blocks = 0
        world_count = 0
        for col in range(11, 88, 2):
            amount = number_or_none(ssphsp_cells.get(f"{col_letter(col)}{row}"))
            if amount is None:
                continue
            world_index = ((col - 11) // 2) + 1
            source_id = f"special:ssp-hsp:{col_letter(col).lower()}"
            source_slug = f"ssp-hsp-world-{world_index}"
            source_name = f"SSP/HSP World {world_index}"
            source = ssphsp_source_map.setdefault(
                col,
                {
                    "id": source_id,
                    "slug": source_slug,
                    "displayName": source_name,
                    "logoUrl": None,
                    "sourceType": "singleplayer",
                    "sourceScope": "ssp_hsp",
                    "sourceCategory": "ssp-hsp",
                    "totalBlocks": 0,
                    "isDead": False,
                    "playerCount": 0,
                    "hasSpreadsheetTotal": False,
                    "needsManualReview": True,
                    "manualReviewReason": "Spreadsheet has per-world SSP/HSP values but no parsed world name for this column.",
                    "rows": [],
                },
            )
            player_key = canonical_name(player_name)
            source["totalBlocks"] += amount
            source["rows"].append(
                {
                    "playerId": f"sheet:{player_key}",
                    "username": player_name,
                    "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(player_name)}/32",
                    "playerFlagUrl": resolve_player_flag_url(ssphsp_images.get((row, 7))),
                    "lastUpdated": "2026-04-21T00:00:00.000Z",
                    "blocksMined": amount,
                    "totalDigs": amount,
                    "rank": 0,
                    "sourceServer": source_name,
                    "sourceKey": f"{source_id}:{player_key}",
                    "sourceCount": 1,
                    "viewKind": "source",
                    "sourceId": source_id,
                    "sourceSlug": source_slug,
                    "rowKey": f"{source_id}:{player_key}",
                    "needsManualReview": True,
                }
            )
            total_blocks += amount
            world_count += 1

        if total_blocks <= 0:
            continue

        player_key = canonical_name(player_name)
        ssphsp_rows.append(
            {
                "playerId": f"sheet:{player_key}",
                "username": player_name,
                "skinFaceUrl": f"https://minotar.net/avatar/{urllib.parse.quote(player_name)}/32",
                "playerFlagUrl": resolve_player_flag_url(ssphsp_images.get((row, 7))),
                "lastUpdated": "2026-04-21T00:00:00.000Z",
                "blocksMined": total_blocks,
                "totalDigs": total_blocks,
                "rank": 0,
                "sourceServer": "SSP/HSP",
                "sourceKey": f"ssphsp:{player_key}",
                "sourceCount": world_count,
                "viewKind": "global",
                "sourceId": "special:ssp-hsp",
                "sourceSlug": "ssp-hsp",
                "rowKey": f"ssphsp:{player_key}",
            }
        )

    digs_individual_world_log = add_digs_individual_world_backfill(
        digs_cells=digs_cells,
        digs_images=digs_images,
        sources=sources,
        ssphsp_source_map=ssphsp_source_map,
        spreadsheet_player_by_key=spreadsheet_player_by_key,
        ambiguous_hashes=ambiguous_hashes,
    )

    ssphsp_sources = list(ssphsp_source_map.values())
    for source in ssphsp_sources:
        source["totalBlocks"] = sum(number_or_none(row.get("blocksMined")) or 0 for row in source["rows"])
        source["rows"].sort(key=lambda item: (-item["blocksMined"], item["username"].lower()))
        source["playerCount"] = len(source["rows"])
        for rank, row in enumerate(source["rows"], start=1):
            row["rank"] = rank
    ssphsp_sources.sort(key=lambda item: (-item["totalBlocks"], item["displayName"].lower()))
    ssphsp_rows = rebuild_ssphsp_rows_from_sources(ssphsp_sources, spreadsheet_player_by_key)

    ssphsp_total_blocks = sum(row["blocksMined"] for row in ssphsp_rows)
    ssp_icon_url = single_world_images.get((9, 10)).relative_logo_url if single_world_images.get((9, 10)) else None
    hsp_icon_url = hardcore_images.get((9, 10)).relative_logo_url if hardcore_images.get((9, 10)) else None

    return {
        "generatedAt": "2026-04-21T00:00:00.000Z",
        "meta": {
            "spreadsheetId": SPREADSHEET_ID,
            "sourceTabs": ["Digs", "Private Server Digs", "SSPHSP Digs"],
            "excludedEntries": excluded_entries,
            "excludedReason": "Entries without a stable source identity were excluded rather than merged incorrectly.",
            "digsIndividualWorldBackfill": digs_individual_world_log,
        },
        "mainLeaderboard": {
            "title": "Single Players",
            "description": "Spreadsheet-backed totals from the MMM Digs tab.",
            "rows": sorted(spreadsheet_players, key=lambda item: item["rank"]),
            "totalBlocks": sum(player["blocksMined"] for player in spreadsheet_players),
            "playerCount": len(spreadsheet_players),
        },
        "specialLeaderboards": {
            "ssp-hsp": {
                "title": "SSP/HSP",
                "description": "Single Player Survival + Hardcore digs from the MMM spreadsheet.",
                "rows": ssphsp_rows,
                "sources": ssphsp_sources,
                "totalBlocks": ssphsp_total_blocks,
                "playerCount": len(ssphsp_rows),
                "icons": {
                    "ssp": ssp_icon_url,
                    "hsp": hsp_icon_url,
                },
            }
        },
        "sources": finalized_sources,
    }


if __name__ == "__main__":
    snapshot = build_snapshot()
    snapshot_json = json.dumps(snapshot, indent=2)
    snapshot_module_json = json.dumps(snapshot, separators=(",", ":"))
    OUTPUT_JSON.write_text(snapshot_json, encoding="utf-8")
    OUTPUT_JS.write_text(f"const snapshot={snapshot_module_json};\n\nexport default snapshot;\n", encoding="utf-8")
    print(OUTPUT_JSON)
    print(OUTPUT_JS)
