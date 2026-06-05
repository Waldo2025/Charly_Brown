ES_DICT_CANDIDATES = ("es_MX", "es_ES", "es")
EN_DICT_CANDIDATES = ("en_US", "en_GB", "en")
SPELL_ISSUE_LIMIT = 120
MIN_TOKEN_LEN = 4
LOW_SIGNAL_PAGE_TEXT_LEN = 80
SECTION_HEADING_MIN_SIZE = 15.5
SECTION_HEADING_TOP_RATIO = 0.25

LEGAL_PAGE_MARKERS = (
    "isbn",
    "reservados todos los derechos",
    "editorial",
    "copyright",
    "impreso por",
    "promotora y comercializadora",
    "shutterstock",
)
INDEX_PAGE_MARKERS = (
    "indice",
    "unidad 1",
    "unidad 2",
    "prologo",
    "lecturas de comprension",
    "recortables",
)
AGENDA_PAGE_MARKERS = (
    "semana",
    "mes",
    "dia",
)
INTRO_PAGE_MARKERS = (
    "prologo",
    "campos formativos",
    "ejes articuladores",
    "competencias intrinsecas",
    "pilares",
)
SPELLING_BLOCKLIST = {
    "morsan",
    "printeligencia",
    "socioemocional",
    "interculturalidad",
    "neurolinguistica",
    "neuropsicologia",
    "andragogia",
    "contextualizadas",
    "xoloitzcuintle",
    "sacadicos",
    "copreterito",
    "guion",
}

