def find_pagination_issues(pages):
    issues = []
    previous = None
    previous_index = -1
    for index, page in enumerate(pages):
        current = int(page.get("logicalPageNumber") or page.get("printedPageNumber") or 0)
        if current <= 0:
            continue
        current_rule_start = int(page.get("logicalPageRuleStartPage") or 0)
        previous_rule_start = int((pages[previous_index].get("logicalPageRuleStartPage") or 0) if previous_index >= 0 else 0)
        current_source = str(page.get("logicalPageSource") or "")
        previous_source = str((pages[previous_index].get("logicalPageSource") or "") if previous_index >= 0 else "")
        if previous is not None and current_source == "pdf-label" and previous_source == "pdf-label" and current_rule_start != previous_rule_start:
            previous = current
            previous_index = index
            continue
        if previous is not None and current != previous + 1:
            skipped_pages = pages[previous_index + 1:index]
            spacer_count = len(skipped_pages)
            if spacer_count > 0:
                all_spacers = all(
                    int(entry.get("logicalPageNumber") or entry.get("printedPageNumber") or 0) == 0
                    and str(entry.get("pageType") or "") in {"agenda", "low-signal"}
                    for entry in skipped_pages
                )
                if all_spacers and current == previous + spacer_count + 1:
                    previous = current
                    previous_index = index
                    continue
            issues.append({
                "pdfPageNumber": page["pdfPageNumber"],
                "printedPageNumber": current,
                "expectedPrintedPageNumber": previous + 1,
                "printedPageLabel": str(page.get("logicalPageLabel") or page.get("printedPageNumber") or ""),
                "logicalPageSource": str(page.get("logicalPageSource") or ""),
            })
        previous = current
        previous_index = index
    return issues

