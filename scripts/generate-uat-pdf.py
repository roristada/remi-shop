from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "UAT_TEST_GUIDE_TH.md"
OUTPUT = ROOT / "output" / "pdf" / "remi-shop-uat-test-guide-th.pdf"
FONT = Path(r"C:\Windows\Fonts\tahoma.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\tahomabd.ttf")


def esc(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(value: str) -> str:
    value = esc(value.strip())
    value = re.sub(r"`([^`]+)`", r'<font name="Tahoma" backColor="#EAF2F8">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    return value


def page_header(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(colors.HexColor("#19324A"))
    canvas.rect(0, height - 14 * mm, width, 14 * mm, fill=1, stroke=0)
    canvas.setFont("Tahoma-Bold", 8)
    canvas.setFillColor(colors.white)
    canvas.drawString(18 * mm, height - 9 * mm, "REMI SHOP  |  UAT TEST GUIDE")
    canvas.setFillColor(colors.HexColor("#6A7784"))
    canvas.setFont("Tahoma", 8)
    canvas.drawRightString(width - 18 * mm, 12 * mm, f"หน้า {doc.page}")
    canvas.restoreState()


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("Tahoma", str(FONT)))
    pdfmetrics.registerFont(TTFont("Tahoma-Bold", str(FONT_BOLD)))

    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title="คู่มือทดสอบระบบ (UAT) - Remi Shop",
        author="Remi Shop",
    )
    frame = __import__("reportlab.platypus", fromlist=["Frame"]).Frame(
        doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal"
    )
    from reportlab.platypus import PageTemplate
    doc.addPageTemplates([PageTemplate(id="UAT", frames=[frame], onPage=page_header)])

    styles = getSampleStyleSheet()
    title = ParagraphStyle("TitleTH", parent=styles["Title"], fontName="Tahoma-Bold", fontSize=20, leading=27, textColor=colors.HexColor("#19324A"), spaceAfter=5 * mm)
    h2 = ParagraphStyle("H2TH", parent=styles["Heading2"], fontName="Tahoma-Bold", fontSize=13, leading=18, textColor=colors.HexColor("#19324A"), spaceBefore=5 * mm, spaceAfter=2.5 * mm, keepWithNext=True)
    body = ParagraphStyle("BodyTH", parent=styles["BodyText"], fontName="Tahoma", fontSize=9, leading=14, textColor=colors.HexColor("#24323D"), spaceAfter=2 * mm)
    meta = ParagraphStyle("MetaTH", parent=body, fontSize=9, leading=15, textColor=colors.HexColor("#51606D"))
    bullet = ParagraphStyle("BulletTH", parent=body, leftIndent=5 * mm, firstLineIndent=-3.5 * mm, bulletIndent=0, spaceAfter=1.2 * mm)
    table_head = ParagraphStyle("TableHead", parent=body, fontName="Tahoma-Bold", fontSize=7.2, leading=9, textColor=colors.white)
    table_body = ParagraphStyle("TableBody", parent=body, fontSize=6.7, leading=8.5, spaceAfter=0)
    code = ParagraphStyle("Code", parent=body, fontName="Tahoma", fontSize=8, leading=11, leftIndent=4 * mm, rightIndent=4 * mm, backColor=colors.HexColor("#F1F5F8"), borderPadding=3 * mm, borderColor=colors.HexColor("#D7E0E7"), borderWidth=0.5)

    story = []
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line or line == "---":
            i += 1
            continue
        if line.startswith("# "):
            story.append(Paragraph(inline(line[2:]), title))
            i += 1
            continue
        if line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), h2))
            i += 1
            continue
        if line.startswith("> "):
            note = ParagraphStyle("Note", parent=body, leftIndent=4 * mm, borderColor=colors.HexColor("#41A6A0"), borderWidth=2, borderPadding=4 * mm, backColor=colors.HexColor("#F2FAF9"))
            story.append(Paragraph(inline(line[2:]), note))
            i += 1
            continue
        if line.startswith("```"):
            content = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                content.append(lines[i])
                i += 1
            story.append(Preformatted("\n".join(content), code))
            i += 1
            continue
        if line.startswith("| "):
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                if not re.match(r"^\|[\s|:-]+\|$", lines[i]):
                    table_lines.append(lines[i])
                i += 1
            rows = []
            for raw in table_lines:
                cells = [c.strip() for c in raw.strip().strip("|").split("|")]
                rows.append(cells)
            if rows:
                count = len(rows[0])
                widths = [doc.width * ratio for ratio in ({3: [0.38, 0.24, 0.38], 4: [0.08, 0.30, 0.52, 0.10], 5: [0.34, 0.12, 0.12, 0.10, 0.32]}.get(count, [1 / count] * count))]
                data = []
                for r, row in enumerate(rows):
                    cells = row + [""] * (count - len(row))
                    data.append([Paragraph(inline(c), table_head if r == 0 else table_body) for c in cells[:count]])
                tbl = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
                commands = [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#19324A")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#C8D4DC")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
                for r in range(1, len(data)):
                    if r % 2 == 0:
                        commands.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#F4F8FA")))
                tbl.setStyle(TableStyle(commands))
                story.append(tbl)
                story.append(Spacer(1, 3 * mm))
            continue
        if line.startswith("- "):
            story.append(Paragraph(inline(line[2:]), bullet, bulletText="•"))
            i += 1
            continue
        if re.match(r"^\*\*.*\*\*\s{2}$", line):
            story.append(Paragraph(inline(line), meta))
        else:
            story.append(Paragraph(inline(line), body))
        i += 1
    doc.build(story)


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT)
