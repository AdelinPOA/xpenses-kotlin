import os
from collections import defaultdict
from datetime import datetime
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from ..config import settings

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
PDF_EXTENSION = ".pdf"

DARK = colors.HexColor("#1e293b")
MUTED = colors.HexColor("#64748b")
LIGHT_BG = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#e2e8f0")
ACCENT = colors.HexColor("#ea580c")

ASSETS_DIR = Path(__file__).parent.parent / "assets"
LOGO_PATH = ASSETS_DIR / "company_logo.png"


def _fmt_date(val) -> str:
    if isinstance(val, datetime):
        return val.strftime("%d.%m.%Y")
    if isinstance(val, str) and len(val) >= 10:
        parts = val[:10].split("-")
        if len(parts) == 3:
            return f"{parts[2]}.{parts[1]}.{parts[0]}"
    return str(val) if val else ""


def _fmt_datetime(val) -> str:
    if isinstance(val, datetime):
        return val.strftime("%d.%m.%Y %H:%M")
    return _fmt_date(val)


def _fmt_duration(start, end) -> str:
    if isinstance(start, datetime) and isinstance(end, datetime):
        total_min = int((end - start).total_seconds() / 60)
        h, m = divmod(total_min, 60)
        return f"{h}h {m:02d}m"
    return ""


def _currency_fmt(amount: float, currency: str) -> str:
    if currency == "EUR":
        return f"€{amount:,.2f}"
    elif currency == "GBP":
        return f"£{amount:,.2f}"
    elif currency == "USD":
        return f"${amount:,.2f}"
    return f"{amount:,.2f} {currency}"


def _build_main_pdf(
    report: dict,
    expenses: list[dict],
    advances: list[dict] | None = None,
    mileage: list[dict] | None = None,
    signer: dict | None = None,
) -> tuple[BytesIO, list]:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=20, spaceAfter=2,
                                 textColor=DARK)
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, spaceAfter=4,
                               spaceBefore=8, textColor=DARK)
    body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=9, leading=12)
    small_style = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, leading=11)
    caption_style = ParagraphStyle("caption", parent=styles["Normal"], fontSize=8,
                                   textColor=MUTED, leading=11)
    bold_style = ParagraphStyle("bold", parent=styles["Normal"], fontSize=9, leading=12,
                                 fontName="Helvetica-Bold")

    total_style = ParagraphStyle("total_big", parent=styles["Normal"], fontSize=22,
                                  fontName="Helvetica-Bold", textColor=DARK, alignment=2)
    total_label = ParagraphStyle("total_label", parent=styles["Normal"], fontSize=9,
                                  textColor=MUTED, alignment=2)

    story = []

    # ── Header: Logo + Title + Total ──────────────────────────────────────────
    header_left = []
    if LOGO_PATH.exists():
        header_left.append(Image(str(LOGO_PATH), width=28 * mm, height=28 * mm))
        header_left.append(Spacer(1, 2 * mm))
    header_left.append(Paragraph(settings.company_name, ParagraphStyle(
        "company", parent=styles["Normal"], fontSize=13, fontName="Helvetica-Bold",
        textColor=DARK)))

    total_eur = sum(e["amount_eur"] for e in expenses)
    header_right = [
        Paragraph("Expense Report", title_style),
        Paragraph(f"#{report['id']}", ParagraphStyle(
            "report_id", parent=styles["Normal"], fontSize=10, textColor=MUTED, alignment=2)),
        Paragraph(report["status"].capitalize(), ParagraphStyle(
            "status", parent=styles["Normal"], fontSize=10, textColor=MUTED, alignment=2)),
        Spacer(1, 4 * mm),
        Paragraph("Total", total_label),
        Paragraph(f"€{total_eur:,.2f}", total_style),
    ]

    left_cell = []
    for item in header_left:
        left_cell.append(item)

    header_table = Table(
        [[left_cell, header_right]],
        colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 4 * mm))

    # ── Report info ───────────────────────────────────────────────────────────
    story.append(Paragraph("Report", caption_style))
    story.append(Paragraph(report["title"], bold_style))
    if report.get("description"):
        desc_text = report["description"]
        if len(desc_text) > 1500:
            desc_text = desc_text[:1500] + "..."
        desc_text = desc_text.replace("\n", "<br/>")
        story.append(Paragraph(desc_text, small_style))
    story.append(Spacer(1, 4 * mm))

    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER))
    story.append(Spacer(1, 3 * mm))

    # Submitted By
    story.append(Paragraph("Submitted By", caption_style))
    story.append(Paragraph(f"<b>{settings.submitter_name}</b>", body_style))
    story.append(Paragraph(settings.submitter_email, body_style))
    story.append(Spacer(1, 3 * mm))

    # Report Duration
    if report.get("date_from") or report.get("date_to"):
        story.append(Paragraph("Report Duration", caption_style))
        date_from = _fmt_date(report.get("date_from")) if report.get("date_from") else ""
        date_to = _fmt_date(report.get("date_to")) if report.get("date_to") else ""
        if date_from and date_to:
            story.append(Paragraph(f"<b>{date_from} - {date_to}</b>", body_style))
        elif date_from:
            story.append(Paragraph(f"<b>From {date_from}</b>", body_style))
        elif date_to:
            story.append(Paragraph(f"<b>To {date_to}</b>", body_style))
        story.append(Spacer(1, 3 * mm))

    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 6 * mm))

    # ── Expense Summary table ─────────────────────────────────────────────────
    story.append(Paragraph("EXPENSE SUMMARY", h2_style))

    col_widths = [10 * mm, None, 30 * mm, 30 * mm, 30 * mm]
    fixed = sum(w for w in col_widths if w)
    col_widths[1] = CONTENT_W - fixed

    header = ["S.No", "Expense Details", "Category", "Amount", "Amount (EUR)"]
    table_data = [header]

    pdf_receipts: list[tuple[int, str, str]] = []

    for idx, e in enumerate(expenses, start=1):
        expense_receipts = e.get("receipts") or []
        if not expense_receipts and e.get("receipt_path"):
            expense_receipts = [{"file_path": e["receipt_path"]}]

        for rcpt in expense_receipts:
            ext = os.path.splitext(rcpt["file_path"])[1].lower()
            if ext == PDF_EXTENSION:
                pdf_receipts.append((e["id"], rcpt["file_path"],
                                     f"#{idx} – {e.get('merchant') or e.get('description') or 'Expense'}"))

        date_str = _fmt_date(e.get("date", ""))
        merchant = e.get("merchant") or ""
        details = Paragraph(
            f"<b>{date_str}</b><br/>Merchant : {merchant}" if merchant else f"<b>{date_str}</b>",
            small_style
        )

        orig_amount = _currency_fmt(e["amount_original"], e["currency_original"])
        eur_amount = _currency_fmt(e["amount_eur"], "EUR")

        amount_cell_parts = [orig_amount]
        if e["currency_original"] != "EUR" and e["fx_rate"] != 1.0:
            amount_cell_parts.append(f"1 {e['currency_original']} = {e['fx_rate']:.6f} EUR")
        amount_cell = Paragraph("<br/>".join(amount_cell_parts), small_style)

        table_data.append([
            f"{idx}.",
            details,
            e.get("category_name") or "—",
            amount_cell,
            eur_amount,
        ])

    expense_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    expense_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 1), (4, -1), "RIGHT"),
    ]))
    story.append(expense_table)
    story.append(Spacer(1, 8 * mm))

    # ── Advance Payments table ───────────────────────────────────────────────
    paid_advances = [a for a in (advances or []) if a.get("status", "paid") == "paid"]
    if paid_advances:
        story.append(Paragraph("ADVANCE PAYMENTS", h2_style))
        adv_header = ["S.No", "Date", "Description", "Amount", "Amount (EUR)"]
        adv_col_widths = [10 * mm, 25 * mm, None, 30 * mm, 30 * mm]
        adv_fixed = sum(w for w in adv_col_widths if w)
        adv_col_widths[2] = CONTENT_W - adv_fixed

        adv_data = [adv_header]
        for adv_idx, a in enumerate(paid_advances, start=1):
            date_str = _fmt_date(a.get("date", ""))
            orig = _currency_fmt(a["amount_original"], a["currency_original"])
            eur = _currency_fmt(a["amount_eur"], "EUR")
            adv_data.append([
                f"{adv_idx}.",
                date_str,
                a.get("description") or "—",
                orig,
                eur,
            ])

        adv_table = Table(adv_data, colWidths=adv_col_widths, repeatRows=1)
        adv_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 6),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("TOPPADDING", (0, 1), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (3, 1), (4, -1), "RIGHT"),
        ]))
        story.append(adv_table)
        story.append(Spacer(1, 8 * mm))

    # ── Mileage Records table ────────────────────────────────────────────────
    if mileage:
        story.append(Paragraph("MILEAGE", h2_style))
        mil_header = ["S.No", "Date/Time", "Duration", "Route", "km", "Rate BT", "Gross (€)", "Rate AT", "Net (€)"]
        mil_col_widths = [10 * mm, 28 * mm, 16 * mm, None, 14 * mm, 16 * mm, 20 * mm, 16 * mm, 20 * mm]
        mil_fixed = sum(w for w in mil_col_widths if w)
        mil_col_widths[3] = CONTENT_W - mil_fixed

        mil_data = [mil_header]
        total_km = 0.0
        total_gross = 0.0
        total_net = 0.0
        total_duration_min = 0
        for mil_idx, m in enumerate(mileage, start=1):
            total_km += m["distance_km"]
            total_gross += m["amount_before_tax"]
            total_net += m["amount_eur"]
            route = f"{m['origin']} → {m['destination']}"
            duration_str = _fmt_duration(m.get("start_time"), m.get("end_time"))
            if isinstance(m.get("start_time"), datetime) and isinstance(m.get("end_time"), datetime):
                total_duration_min += int((m["end_time"] - m["start_time"]).total_seconds() / 60)
            mil_data.append([
                f"{mil_idx}.",
                _fmt_datetime(m.get("start_time", "")),
                duration_str,
                Paragraph(route, small_style),
                f"{m['distance_km']:.1f}",
                f"{m['rate_before_tax']:.2f}",
                f"€{m['amount_before_tax']:,.2f}",
                f"{m['rate_after_tax']:.2f}",
                f"€{m['amount_eur']:,.2f}",
            ])
        total_h, total_m = divmod(total_duration_min, 60)
        mil_data.append([
            "", "", f"{total_h}h {total_m:02d}m", Paragraph("<b>TOTAL</b>", small_style),
            f"{total_km:.1f}", "", f"€{total_gross:,.2f}", "", f"€{total_net:,.2f}",
        ])

        mil_table = Table(mil_data, colWidths=mil_col_widths, repeatRows=1)
        mil_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 7),
            ("TOPPADDING", (0, 0), (-1, 0), 6),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("TOPPADDING", (0, 1), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LIGHT_BG]),
            ("BACKGROUND", (0, -1), (-1, -1), LIGHT_BG),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (4, 1), (-1, -1), "RIGHT"),
        ]))
        story.append(mil_table)
        story.append(Spacer(1, 8 * mm))

    # ── Report Summary by Currency ────────────────────────────────────────────
    by_currency: dict[str, list[dict]] = defaultdict(list)
    for e in expenses:
        by_currency[e["currency_original"]].append(e)

    if len(by_currency) > 1 or (len(by_currency) == 1 and list(by_currency.keys())[0] != "EUR"):
        story.append(Paragraph("REPORT SUMMARY BY CURRENCY", h2_style))

        currencies = sorted(by_currency.keys())
        summary_header = ["TOTAL"] + currencies
        col_w = [35 * mm] + [(CONTENT_W - 35 * mm) / len(currencies)] * len(currencies)

        total_row_data = ["Total Expense Amount"]
        reimbursable_row_data = [Paragraph("<b>Total Reimbursable<br/>Amount</b>", small_style)]
        for cur in currencies:
            cur_expenses = by_currency[cur]
            cur_total = sum(e["amount_original"] for e in cur_expenses)
            eur_total = sum(e["amount_eur"] for e in cur_expenses)
            total_row_data.append(Paragraph(f"{cur_total:,.2f}", small_style))
            reimbursable_row_data.append(Paragraph(
                f"<b>{_currency_fmt(cur_total, cur)}</b><br/>{_currency_fmt(eur_total, 'EUR')} (in EUR)",
                small_style
            ))

        summary_data = [summary_header, total_row_data, reimbursable_row_data]

        summary_table = Table(summary_data, colWidths=col_w)
        summary_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ("BACKGROUND", (0, -1), (-1, -1), LIGHT_BG),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 6 * mm))

    # ── Report Summary ────────────────────────────────────────────────────────
    story.append(Paragraph("REPORT SUMMARY", h2_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MUTED))
    story.append(Spacer(1, 3 * mm))

    total_advances_eur = sum(a["amount_eur"] for a in (advances or []) if a.get("status", "paid") == "paid")

    allowance = 0.0
    if report.get("date_from") and report.get("date_to"):
        try:
            d_from = datetime.strptime(report["date_from"][:10], "%Y-%m-%d")
            d_to = datetime.strptime(report["date_to"][:10], "%Y-%m-%d")
            days = (d_to - d_from).days + 1
            if days > 0:
                allowance = days * 50.0
        except ValueError:
            pass

    total_mileage_eur = sum(m["amount_eur"] for m in (mileage or []))
    total_reimbursable = total_eur + allowance + total_mileage_eur - total_advances_eur

    summary_items = [
        [Paragraph("Total Expense", caption_style),
         Paragraph(f"<b>€{total_eur:,.2f}</b>", body_style)],
    ]

    if allowance > 0:
        summary_items.extend([
            [Paragraph("( + )", caption_style), Paragraph("", body_style)],
            [Paragraph("Daily Allowance", caption_style),
             Paragraph(f"<b>€{allowance:,.2f}</b>", body_style)],
        ])

    if total_mileage_eur > 0:
        summary_items.extend([
            [Paragraph("( + )", caption_style), Paragraph("", body_style)],
            [Paragraph("Mileage", caption_style),
             Paragraph(f"<b>€{total_mileage_eur:,.2f}</b>", body_style)],
        ])

    summary_items.extend([
        [Paragraph("( - )", caption_style), Paragraph("", body_style)],
        [Paragraph("Non Reimbursable", caption_style),
         Paragraph("<b>€0,00</b>", body_style)],
        [Paragraph("( - )", caption_style), Paragraph("", body_style)],
        [Paragraph("Advance Received", caption_style),
         Paragraph(f"<b>€{total_advances_eur:,.2f}</b>", body_style)],
        [Paragraph("( = )", caption_style), Paragraph("", body_style)],
        [Paragraph("Total Reimbursable", caption_style),
         Paragraph(f"<b>€{total_reimbursable:,.2f}</b>", body_style)],
    ])
    summary_flow = Table(
        [summary_items],
        colWidths=[CONTENT_W / len(summary_items)] * len(summary_items),
    )
    summary_flow.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(summary_flow)
    story.append(Spacer(1, 2 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MUTED))

    # ── Signature area ────────────────────────────────────────────────────────
    story.append(Spacer(1, 20 * mm))
    story.append(Paragraph("<b><u>Submitted By</u></b>", body_style))

    if signer and signer.get("signature_path") and os.path.exists(signer["signature_path"]):
        story.append(Spacer(1, 5 * mm))
        story.append(Image(signer["signature_path"], width=40 * mm, height=15 * mm))
        story.append(HRFlowable(width=50 * mm, thickness=0.5, color=DARK))
        signer_name = signer.get("display_name", settings.submitter_name)
        signed_at = report.get("signed_at")
        signed_str = f" — signed {_fmt_datetime(signed_at)}" if signed_at else ""
        story.append(Paragraph(f"<b>{signer_name}</b>{signed_str}", body_style))
    else:
        story.append(Spacer(1, 15 * mm))
        story.append(HRFlowable(width=50 * mm, thickness=0.5, color=DARK))
        story.append(Paragraph(f"<b>{settings.submitter_name}</b>", body_style))

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        f"Generated on {datetime.utcnow().strftime('%d.%m.%Y %H:%M')} UTC",
        caption_style,
    ))

    # ── Receipt pages (2 per row) ─────────────────────────────────────────────
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

        cell_w = (CONTENT_W - 4 * mm) / 2
        max_img_h = 100 * mm

        pairs = []
        for i in range(0, len(image_items), 2):
            left = image_items[i]
            right = image_items[i + 1] if i + 1 < len(image_items) else None
            pairs.append((left, right))

        for left, right in pairs:
            row_images = []
            row_captions = []

            for item in [left, right]:
                if item is None:
                    row_images.append("")
                    row_captions.append("")
                    continue

                idx, e, file_path = item
                full_path = os.path.join(settings.receipts_dir, file_path)

                if os.path.exists(full_path):
                    try:
                        img = _fit_image(full_path, cell_w - 4 * mm, max_img_h)
                        row_images.append(img)
                    except Exception:
                        row_images.append(Paragraph(f"[Image error: {file_path}]", caption_style))
                else:
                    row_images.append(Paragraph(f"[Missing: {file_path}]", caption_style))

                caption_parts = [
                    f"<b>{_fmt_date(e.get('date', ''))}</b>",
                    f"<b>{_currency_fmt(e['amount_eur'], 'EUR')}</b>",
                ]
                row_captions.append(Paragraph("<br/>".join([
                    " ".join(caption_parts),
                    e.get("category_name") or "",
                    f"Merchant : {e.get('merchant') or '—'}",
                ]), small_style))

            img_table = Table(
                [[row_images[0], row_images[1]],
                 [row_captions[0], row_captions[1]]],
                colWidths=[cell_w, cell_w],
            )
            img_table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, 0), "BOTTOM"),
                ("VALIGN", (0, 1), (-1, 1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 2 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
                ("BOX", (0, 0), (0, -1), 0.5, BORDER),
                ("BOX", (1, 0), (1, -1), 0.5, BORDER),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, BORDER),
            ]))
            story.append(img_table)
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
    from pypdf import PdfReader, PdfWriter

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


async def generate_report_pdf(
    report: dict,
    expenses: list[dict],
    advances: list[dict] | None = None,
    mileage: list[dict] | None = None,
    signer: dict | None = None,
) -> bytes:
    main_buf, pdf_receipts = _build_main_pdf(report, expenses, advances, mileage, signer)

    if pdf_receipts:
        return _merge_pdf_receipts(main_buf, pdf_receipts)

    return main_buf.read()
