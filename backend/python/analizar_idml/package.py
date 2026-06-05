import zipfile


def open_idml(path):
    archive = zipfile.ZipFile(path)
    if "designmap.xml" not in archive.namelist():
        archive.close()
        raise ValueError("IDML_INVALID: missing designmap.xml")
    return archive
