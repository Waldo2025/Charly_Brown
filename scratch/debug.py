import sys
from pathlib import Path

# Add backend/python to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend" / "python"))

from analizar_idml.pipeline import open_idml, parse_pages
from analizar_idml.pages import parse_xml, local_name

sample = "public/analizarPDF/EEFESPPRI_10REV_TRIM1_P2_LA_02_U1.idml"
with open_idml(sample) as archive:
    pages = parse_pages(archive)
    page31 = next((p for p in pages if str(p.get("pageName")) == "31"), None)
    if page31:
        root = parse_xml(archive, page31.get("spreadSource"))
        
        # Find the Page node
        for node in root.iter():
            if local_name(node.tag) == "Page" and node.get("Name") == "31":
                print("Page Node details:")
                print(f"  Self: {node.get('Self')}")
                print(f"  ItemTransform: {node.get('ItemTransform')}")
                print(f"  GeometricBounds: {node.get('GeometricBounds')}")
    else:
        print("Page 31 not found")
