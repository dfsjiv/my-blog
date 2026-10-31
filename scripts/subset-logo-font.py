"""Build the four-letter wordmark without shipping the complete variable font.

Requires fonttools[woff]==4.60.1. Run from the project root. The original font and
its SIL OFL license remain in assets/vendor/caveat for reproducibility.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

root = Path(__file__).resolve().parent.parent
source = root / "assets/vendor/caveat/Caveat.ttf"
target = root / "assets/vendor/caveat/ZhenWordmark.woff2"
font = TTFont(source)
if "fvar" in font:
    instantiateVariableFont(font, {"wght": 400}, inplace=True)

def outlines(face):
    glyphs = face.getGlyphSet()
    cmap = face.getBestCmap()
    result = {}
    for character in "Zhen ":
        name = cmap[ord(character)]
        pen = DecomposingRecordingPen(glyphs)
        glyphs[name].draw(pen)
        result[character] = (pen.value, face["hmtx"].metrics[name])
    return result

original = outlines(font)
options = subset.Options()
options.flavor = "woff2"
options.glyph_names = True
options.layout_features = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(text="Zhen ")
subsetter.subset(font)
for record in font["name"].names:
    names = {1: "Zhen Wordmark", 2: "Regular", 3: "ZhenWordmark-Regular:20261101", 4: "Zhen Wordmark Regular", 6: "ZhenWordmark-Regular"}
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
font.flavor = "woff2"
font.save(target)
rebuilt = TTFont(target)
assert outlines(rebuilt) == original, "Wordmark outlines or metrics changed"
print(f"Wordmark: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes; outlines and metrics unchanged")
