from .styles import local_name, parse_xml


def _clamp_channel(value):
    try:
        numeric = float(str(value or "").strip())
    except (TypeError, ValueError):
        return 0
    return max(0, min(255, int(round(numeric))))


def _format_cmyk(color_value):
    values = [segment.strip() for segment in str(color_value or "").split() if segment.strip()]
    if len(values) != 4:
      return ""
    return ",".join(values)


def _hex_from_rgb(color_value):
    values = [segment.strip() for segment in str(color_value or "").split() if segment.strip()]
    if len(values) != 3:
        return ""
    red, green, blue = (_clamp_channel(value) for value in values)
    return f"#{red:02X}{green:02X}{blue:02X}"


def _hex_from_cmyk(color_value):
    values = [segment.strip() for segment in str(color_value or "").split() if segment.strip()]
    if len(values) != 4:
        return ""
    try:
        cyan, magenta, yellow, black = [max(0.0, min(100.0, float(value))) / 100.0 for value in values]
    except (TypeError, ValueError):
        return ""
    red = 255 * (1 - cyan) * (1 - black)
    green = 255 * (1 - magenta) * (1 - black)
    blue = 255 * (1 - yellow) * (1 - black)
    return f"#{_clamp_channel(red):02X}{_clamp_channel(green):02X}{_clamp_channel(blue):02X}"


def _derive_color_formats(space="", color_value=""):
    clean_space = str(space or "").strip().upper()
    if clean_space == "CMYK":
        return {
            "cmyk": _format_cmyk(color_value),
            "hex": _hex_from_cmyk(color_value),
        }
    if clean_space == "RGB":
        return {
            "cmyk": "",
            "hex": _hex_from_rgb(color_value),
        }
    return {
        "cmyk": "",
        "hex": "",
    }


def parse_swatches(archive, member_name="Resources/Graphic.xml"):
    root = parse_xml(archive, member_name)
    swatches = []

    for node in root.iter():
        if local_name(node.tag) != "Color":
            continue
        color_value = node.get("ColorValue", "")
        space = node.get("Space", "")
        derived = _derive_color_formats(space, color_value)
        swatches.append({
            "self": node.get("Self", ""),
            "name": node.get("Name", ""),
            "model": node.get("Model", ""),
            "space": space,
            "colorValue": color_value,
            "cmyk": derived["cmyk"],
            "hex": derived["hex"],
        })

    return swatches
