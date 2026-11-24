"""Build the people list for the Where Are They Now card (public/disco) from the content sheet.

  python tools/build-where-are-they-now.py "Here and Now - CONTENT.csv" [--photos "people photos"]

Reads the sheet exported as CSV (one column per person; it stays outside the repository) and writes
public/disco/assets/people.json: the batches in order, each with its people. A person's card shows
the curated lines of the sheet's "Sample cards" row (Previous affiliations, Current role, ...).
Only people with content are listed:
  - a sample card, unless it says the person does not want one;
  - otherwise one of the short edited paragraphs in FALLBACK below (taken from the sheet's
    "WHERE ARE THEY NOW?" notes, which are raw interview notes and are not published as they are).
A portrait is used when public/disco/assets/people/<slug>.(webp|jpg|jpeg|png) exists, where <slug> is
the person's name in lower case with hyphens (e.g. akshay.webp, jessica-jones.webp); otherwise the
card shows one of the generic face drawings from the disco ball.

--photos <folder> imports portraits first: each image in the folder is matched to a person by the first
word of its file name ("jessica ug15.jpeg" -> Jessica Jones; small spelling differences are allowed),
cropped square and saved as a 480 px WebP under that slug. The originals stay outside the repository.
Needs Pillow; HEIC files are read through ffmpeg.
"""
import csv, difflib, io, json, re, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'disco' / 'assets'

# People without a sample card: a short paragraph edited from their trajectory notes.
FALLBACK = {
    'Bharat etc': ('Bharat', 'Works with Immerse, a studio that creates original immersive experiences as well as commercial and corporate projects.'),
    'Anant': ('Anant', 'Interested in installation and spatial design. Open to working with studios, organisations or corporate setups to gain experience, learn from professionals and build his portfolio.'),
    'mugdha': ('Mugdha', 'Pursuing a Master’s in Social Design at Design Academy Eindhoven, Netherlands.'),
    'purvi': ('Purvi', 'Works at PMG Asia Pacific, an event management company operating at an international level, involved in hands-on production, concept development and visualisation.'),
}
LABELS = {   # the sheet's labels, tidied to one spelling
    'previous affiliations': 'Previous affiliations', 'previous professional affiliations': 'Previous affiliations',
    'academic affiliations': 'Academic affiliations', 'independent practice': 'Independent practice',
    'independent practise': 'Independent practice', 'current role': 'Current role', 'areas of interest': 'Areas of interest',
}
TYPOS = {'theapist': 'therapist'}
CROP = {'komal': (.5, .75)}   # where a portrait's square crop sits when the default cuts badly: slug -> (x, y)

def clean(text):
    text = re.sub(r'\s+', ' ', text).strip(' /;,')
    for wrong, right in TYPOS.items():
        text = text.replace(wrong, right)
    return text

def batch_year(cell):
    m = re.search(r'\d{4}|\d{2}', cell)
    if not m:
        return None
    n = int(m.group())
    return n if n > 100 else 2000 + n

def parse_card(cell):
    """Sample card -> (name, [[label, text], ...]). Lines without a label continue the one above."""
    lines = [l.strip() for l in cell.replace('\r', '').split('\n') if l.strip()]
    if not lines or re.match(r"does\s*n.?t want", lines[0], re.I):
        return None
    name, fields = clean(lines[0]), []
    for line in lines[1:]:
        m = re.match(r'^([A-Za-z ]{3,40}):\s*(.*)$', line)
        label = LABELS.get(m.group(1).strip().lower()) if m else None
        if m and m.group(1).strip().lower() == 'batch':
            continue
        if label:
            fields.append([label, clean(m.group(2))])
        elif fields:
            fields[-1][1] = clean(fields[-1][1] + ('; ' if fields[-1][1] else '') + line)
        else:
            fields.append(['', clean(line)])
    fields = [[l, t if t.endswith(('.', '!', '?')) else t + '.'] for l, t in fields if t]
    # One entry per label, in the sheet's order.
    merged = []
    for label, text in fields:
        same = next((f for f in merged if f[0] == label and label), None)
        if same:
            same[1] = same[1].rstrip('.') + '; ' + text
        else:
            merged.append([label, text])
    return name, merged

def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

def import_photos(folder, names):
    """Match each image to a listed person by first name and save a square WebP for the card."""
    from PIL import Image, ImageOps
    (OUT / 'people').mkdir(parents=True, exist_ok=True)
    first = {n.split()[0].lower(): n for n in names}
    for file in sorted(Path(folder).iterdir()):
        if file.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp', '.heic'):
            continue
        key = re.split(r'[^a-z]+', file.stem.lower())[0]
        match = difflib.get_close_matches(key, first, n=1, cutoff=.8)
        if not match:
            print('  photo not matched to anyone listed:', file.name)
            continue
        source = file
        if file.suffix.lower() == '.heic':
            source = Path(tempfile.mkdtemp()) / 'photo.png'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(file), '-frames:v', '1', str(source)], check=True)
        image = ImageOps.exif_transpose(Image.open(source)).convert('RGB')
        # Square crop, a little above centre: portraits keep the face.
        image = ImageOps.fit(image, (480, 480), Image.LANCZOS, centering=CROP.get(slug(first[match[0]]), (.5, .35)))
        image.save(OUT / 'people' / f'{slug(first[match[0]])}.webp', quality=82, method=6)
        print('  photo', file.name, '->', first[match[0]])

def main(path, photos=None):
    rows = list(csv.reader(io.StringIO(Path(path).read_bytes().decode('utf-8-sig'))))
    by = {r[0].strip().split('(')[0].strip().upper(): r for r in rows if r and r[0].strip()}
    head, batches, cards = rows[0], by['BATCH'], by['SAMPLE CARDS']
    people, skipped = [], []
    for j in range(1, len(head)):
        column = head[j].strip()
        cell = cards[j] if j < len(cards) else ''
        year = batch_year(batches[j] if j < len(batches) else '')
        parsed = parse_card(cell) if cell.strip() else None
        if parsed:
            name, fields = parsed
        elif column in FALLBACK and not cell.strip():
            name, fields = FALLBACK[column][0], [['', FALLBACK[column][1]]]
        else:
            skipped.append(column.split(' Batch')[0])
            continue
        if not year or not fields:
            skipped.append(name)
            continue
        people.append({'name': name, 'batch': 'UG%02d' % (year % 100), 'year': year, 'fields': fields})
    if photos:
        import_photos(photos, [p['name'] for p in people])
    for person in people:
        name = person['name']
        for ext in ('webp', 'jpg', 'jpeg', 'png'):
            if (OUT / 'people' / f'{slug(name)}.{ext}').exists():
                person['photo'] = f'assets/people/{slug(name)}.{ext}'
                break
    years = sorted({p['year'] for p in people})
    data = {'batches': [{'id': 'UG%02d' % (y % 100), 'year': y,
                         'people': [{k: v for k, v in p.items() if k not in ('batch', 'year')} for p in people if p['year'] == y]}
                        for y in years]}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'people.json').write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(len(people), 'people in', len(years), 'batches ->', OUT / 'people.json')
    for b in data['batches']:
        print(' ', b['id'], ', '.join(p['name'] + ('*' if 'photo' in p else '') for p in b['people']))
    print('not listed (no content yet, or asked not to be):', ', '.join(skipped))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[sys.argv.index('--photos') + 1] if '--photos' in sys.argv else None)
