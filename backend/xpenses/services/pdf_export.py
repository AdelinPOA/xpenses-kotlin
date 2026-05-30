import os
from io import BytesIO
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, Image, PageBreak, HRFlowable,
)

from ..config import settings

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
PDF_EXTENSION = ".pdf"


def _currency_fmt(amount: float, currency: str) -> str:
    return f"{amount:,.2f} {currency}"


def _build_main_pdf(report: dict, expenses: list[dict]) -> tuple[BytesIO, list]:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=18, spaceAfter=4)
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11, spaceAfter=2)
    body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=9, leading=13)
    caption_style = ParagraphStyle("caption", parent=styles["Normal"], fontSize=8,
                                   textColor=colors.HexColor("#64748b"), leading=11)
    receipt_label_style = ParagraphStyle("receipt_label", parent=styles["Heading3"],
                                         fontSize=10, spaceBefore=12, spaceAfter=4)

    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    story.append(Paragraph("xpenses", title_style))
    story.append(Paragraph(f"Expense Report: {report['title']}", h2_style))

    meta_rows = [
        ["Status:", report["status"].capitalize()],
        ["Currency:", "EUR (all amounts converted)"],
        ["Created:", report["created_at"][:10]],
    ]
    if report.get("date_from") and report.get("date_to"):
        meta_rows.append(["Period:", f"{report['date_from']} — {report['date_to']}"])
    elif report.get("date_from"):
        meta_rows.append(["From:", report["date_from"]])
    elif report.get("date_to"):
        meta_rows.append(["To:", report["date_to"]])
    if report.get("submitted_at"):
        meta_rows.append(["Submitted:", report["submitted_at"][:10]])
    if report.get("paid_at"):
        meta_rows.append(["Paid:", report["paid_at"][:10]])
    if report.get("description"):
        meta_rows.append(["Description:", report["description"]])

    meta_table = Table(meta_rows, colWidths=[35 * mm, CONTENT_W - 35 * mm])
    meta_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
    story.append(Spacer(1, 4 * mm))

    # ── Expense table ─────────────────────────────────────────────────────────
    story.append(Paragraph("Expenses", h2_style))

    col_widths = [8 * mm, 18 * mm, 28 * mm, 26 * mm, None, 26 * mm, 24 * mm, 14 * mm]
    fixed = sum(w for w in col_widths if w)
    col_widths[4] = CONTENT_W - fixed

    header = ["#", "Date", "Merchant", "Category", "Description", "Original", "EUR", "Rcpt"]
    table_data = [header]

    pdf_receipts: list[tuple[int, str, str]] = []

    for idx, e in enumerate(expenses, start=1):
        expense_receipts = e.get("receipts") or []
        if not expense_receipts and e.get("receipt_path"):
            expense_receipts = [{"file_path": e["receipt_path"]}]

        has_images = False
        has_pdfs = False
        for rcpt in expense_receipts:
            ext = os.path.splitext(rcpt["file_path"])[1].lower()
            if ext == PDF_EXTENSION:
                has_pdfs = True
                pdf_receipts.append((e["id"], rcpt["file_path"],
                                     f"#{idx} – {e.get('merchant') or e.get('description') or 'Expense'}"))
            elif ext in IMAGE_EXTENSIONS:
                has_images = True

        if has_images and has_pdfs:
            receipt_marker = f"#{idx}+PDF"
        elif has_images:
            receipt_marker = f"#{idx}"
        elif has_pdfs:
            receipt_marker = "PDF"
        elif expense_receipts:
            receipt_marker = f"#{idx}"
        else:
            receipt_marker = "—"

        orig = _currency_fmt(e["amount_original"], e["currency_original"])
        eur = _currency_fmt(e["amount_eur"], "EUR")

        table_data.append([
            str(idx),
            e.get("date", ""),
            Paragraph(e.get("merchant") or "—", body_style),
            Paragraph(e.get("category_name") or "—", body_style),
            Paragraph(e.get("description") or "—", body_style),
            orig,
            eur,
            receipt_marker,
        ])

    total_eur = sum(e["amount_eur"] for e in expenses)
    table_data.append(["", "", "", "", "TOTAL", "", _currency_fmt(total_eur, "EUR"), ""])

    expense_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    expense_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("FONTSIZE", (0, 1), (-1, -2), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -2), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (4, -1), (6, -1), "Helvetica-Bold"),
        ("FONTSIZE", (4, -1), (6, -1), 9),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#1e293b")),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
    ]))
    story.append(expense_table)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph(
        f"Generated on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC",
        caption_style,
    ))

    # ── Embedded image receipts ───────────────────────────────────────────────
    image_items: list[tuple[int, dict, str]] = []
    for idx, e in enumerate(expenses, 1):
        expense_receipts = e.get("receipts") or []
        if not expense_receipts and e.get("receipt_path"):
            expense_receipts = [{"file_path": e["receipt_path"]}]
        for rcpt in expense_receipts:
            ext = os.path.splitext(rcpt["file_path"])[1].lower()
            if ext in IMAGE_EXTENSIONS:
                image_items.append((idx, e, rcpt["file_path"]))

    if image_items:
        story.append(PageBreak())
        story.append(Paragraph("Receipts", h2_style))
        story.append(Spacer(1, 3 * mm))

        for idx, e, file_path in image_items:
            full_path = os.path.join(settings.receipts_dir, file_path)
            if not os.path.exists(full_path):
                continue

            merchant = e.get("merchant") or ""
            description = e.get("description") or ""
            name_parts = " — ".join(filter(None, [merchant, description])) or "Expense"
            label = (f"#{idx} — {name_parts} — {e.get('date', '')} — "
                     f"{_currency_fmt(e['amount_original'], e['currency_original'])} "
                     f"({_currency_fmt(e['amount_eur'], 'EUR')})")
            story.append(Paragraph(label, receipt_label_style))

            try:
                img = _fit_image(full_path, CONTENT_W, 200 * mm)
                story.append(img)
            except Exception:
                story.append(Paragraph(f"[Could not embed image: {file_path}]", caption_style))

            story.append(Spacer(1, 8 * mm))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
            story.append(Spacer(1, 4 * mm))

    doc.build(story)
    buf.seek(0)
    return buf, pdf_receipts


def _fit_image(path: str, max_w: float, max_h: float) -> Image:
    from PIL import Image as PILImage
    with PILImage.open(path) as pil_img:
        orig_w, orig_h = pil_img.size
    scale = min(max_w / orig_w, max_h / orig_h, 1.0)
    return Image(path, width=orig_w * scale, height=orig_h * scale)


def _merge_pdf_receipts(main_buf: BytesIO, pdf_receipts: list[tuple[int, str, str]]) -> bytes:
    from pypdf import PdfWriter, PdfReader

    writer = PdfWriter()
    main_reader = PdfReader(main_buf)
    for page in main_reader.pages:
        writer.add_page(page)

    for expense_id, receipt_path, label in pdf_receipts:
        full_path = os.path.join(settings.receipts_dir, receipt_path)
        if not os.path.exists(full_path):
            continue
        try:
            receipt_reader = PdfReader(full_path)
            for page in receipt_reader.pages:
                writer.add_page(page)
        except Exception:
            pass

    out = BytesIO()
    writer.write(out)
    out.seek(0)
    return out.read()


async def generate_report_pdf(report: dict, expenses: list[dict]) -> bytes:
    main_buf, pdf_receipts = _build_main_pdf(report, expenses)

    if pdf_receipts:
        return _merge_pdf_receipts(main_buf, pdf_receipts)

    return main_buf.read()
