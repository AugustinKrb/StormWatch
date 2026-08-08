"""Météo-France Bulletin Vigilance fetch + parse: current-day risk level per department.

`/cartevigilance/encours` carries two periods (echeance "J" and "J1" — today and
tomorrow); we only care about "J" here since we're detecting bulletin changes live,
not planning ahead. Each department ("domain_id", plus a few "XXXX"-style coastal/
marine extensions we skip) exposes a max color and one color per phenomenon.
"""

import logging

import requests

from config import MF_VIGILANCE_BASE_URL, MF_VIGILANCE_KEY

log = logging.getLogger(__name__)

_HEADERS = {"apikey": MF_VIGILANCE_KEY} if MF_VIGILANCE_KEY else {}

COLOR_NAMES = {1: "Vert", 2: "Jaune", 3: "Orange", 4: "Rouge"}

PHENOMENON_NAMES = {
    "1": "Vent violent",
    "2": "Pluie-inondation",
    "3": "Orages",
    "4": "Crues",
    "5": "Neige-verglas",
    "6": "Canicule",
    "7": "Grand froid",
    "8": "Avalanches",
    "9": "Vagues-submersion",
}

# Storm-chasing relevant subset, unrelated phenomena dropped at the source.
RELEVANT_PHENOMENON_IDS = {"1", "2", "3", "4", "9"}

DEPT_NAMES = {
    "01": "Ain",
    "02": "Aisne",
    "03": "Allier",
    "04": "Alpes-de-Haute-Provence",
    "05": "Hautes-Alpes",
    "06": "Alpes-Maritimes",
    "07": "Ardèche",
    "08": "Ardennes",
    "09": "Ariège",
    "10": "Aube",
    "11": "Aude",
    "12": "Aveyron",
    "13": "Bouches-du-Rhône",
    "14": "Calvados",
    "15": "Cantal",
    "16": "Charente",
    "17": "Charente-Maritime",
    "18": "Cher",
    "19": "Corrèze",
    "2A": "Corse-du-Sud",
    "2B": "Haute-Corse",
    "21": "Côte-d'Or",
    "22": "Côtes-d'Armor",
    "23": "Creuse",
    "24": "Dordogne",
    "25": "Doubs",
    "26": "Drôme",
    "27": "Eure",
    "28": "Eure-et-Loir",
    "29": "Finistère",
    "30": "Gard",
    "31": "Haute-Garonne",
    "32": "Gers",
    "33": "Gironde",
    "34": "Hérault",
    "35": "Ille-et-Vilaine",
    "36": "Indre",
    "37": "Indre-et-Loire",
    "38": "Isère",
    "39": "Jura",
    "40": "Landes",
    "41": "Loir-et-Cher",
    "42": "Loire",
    "43": "Haute-Loire",
    "44": "Loire-Atlantique",
    "45": "Loiret",
    "46": "Lot",
    "47": "Lot-et-Garonne",
    "48": "Lozère",
    "49": "Maine-et-Loire",
    "50": "Manche",
    "51": "Marne",
    "52": "Haute-Marne",
    "53": "Mayenne",
    "54": "Meurthe-et-Moselle",
    "55": "Meuse",
    "56": "Morbihan",
    "57": "Moselle",
    "58": "Nièvre",
    "59": "Nord",
    "60": "Oise",
    "61": "Orne",
    "62": "Pas-de-Calais",
    "63": "Puy-de-Dôme",
    "64": "Pyrénées-Atlantiques",
    "65": "Hautes-Pyrénées",
    "66": "Pyrénées-Orientales",
    "67": "Bas-Rhin",
    "68": "Haut-Rhin",
    "69": "Rhône",
    "70": "Haute-Saône",
    "71": "Saône-et-Loire",
    "72": "Sarthe",
    "73": "Savoie",
    "74": "Haute-Savoie",
    "75": "Paris",
    "76": "Seine-Maritime",
    "77": "Seine-et-Marne",
    "78": "Yvelines",
    "79": "Deux-Sèvres",
    "80": "Somme",
    "81": "Tarn",
    "82": "Tarn-et-Garonne",
    "83": "Var",
    "84": "Vaucluse",
    "85": "Vendée",
    "86": "Vienne",
    "87": "Haute-Vienne",
    "88": "Vosges",
    "89": "Yonne",
    "90": "Territoire de Belfort",
    "91": "Essonne",
    "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis",
    "94": "Val-de-Marne",
    "95": "Val-d'Oise",
}


def fetch_vigilance() -> dict | None:
    """Current-day vigilance per mainland department (marine/coastal, national "FRA" skipped)."""
    if not MF_VIGILANCE_KEY:
        return None
    try:
        r = requests.get(
            f"{MF_VIGILANCE_BASE_URL}/cartevigilance/encours",
            headers=_HEADERS,
            timeout=20,
        )
        if r.status_code != 200:
            log.error("MF vigilance: HTTP %d %s", r.status_code, r.text[:200])
            return None
        product = r.json()["product"]
        today = next((p for p in product["periods"] if p["echeance"] == "J"), None)
        if today is None:
            log.error("MF vigilance: no 'J' period in response")
            return None

        depts = {}
        for entry in today["timelaps"]["domain_ids"]:
            code = entry["domain_id"]
            if code not in DEPT_NAMES:
                continue
            depts[code] = {
                "name": DEPT_NAMES[code],
                "color": entry["max_color_id"],
                "color_name": COLOR_NAMES[entry["max_color_id"]],
                "phenomena": {
                    p["phenomenon_id"]: {
                        "name": PHENOMENON_NAMES.get(p["phenomenon_id"], p["phenomenon_id"]),
                        "color": p["phenomenon_max_color_id"],
                    }
                    for p in entry["phenomenon_items"]
                    if p["phenomenon_id"] in RELEVANT_PHENOMENON_IDS
                },
            }
        log.info("MF vigilance: %d departments (updated %s)", len(depts), product["update_time"])
        return {"update_time": product["update_time"], "depts": depts}
    except (requests.RequestException, ValueError, KeyError) as e:
        log.error("MF vigilance: %s", e)
        return None
