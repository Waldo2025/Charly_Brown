def find_color_issues(used_swatches, palette):
    expected_names = {
        str((entry or {}).get("swatchName") or "").strip()
        for entry in (palette or [])
        if str((entry or {}).get("swatchName") or "").strip()
    }
    issues = []

    if not expected_names:
        return issues

    for swatch in used_swatches or []:
        name = str((swatch or {}).get("name") or "").strip()
        if not name or name in expected_names:
            continue
        issues.append(f"Swatch no esperado: {name}")

    return issues
