import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = mkdtempSync(path.join(tmpdir(), 'teameet-adaptive-icon-'));
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
let layers;
try {
  const probe = path.join(temp, 'AdaptiveIconProbe.java');
  // ImageIO reads shipped pixels; XML supplies their real tint/inset and manifest entry points.
  // This checks resource geometry, not installed-device rendering or launcher cache behavior.
  writeFileSync(probe, `
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;

class AdaptiveIconProbe {
  static final String ANDROID = "http://schemas.android.com/apk/res/android";
  static Path res;
  record Layer(BufferedImage image, Path source, double left, double top, double right, double bottom, Integer tint) {}
  static Document xml(Path file) throws Exception {
    var factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    return factory.newDocumentBuilder().parse(file.toFile());
  }
  static String attr(Element tag, String name) { return tag.getAttributeNS(ANDROID, name); }
  static double inset(Element tag, String side) {
    var value = attr(tag, "inset" + side);
    if (value.isEmpty()) value = attr(tag, "inset");
    if (value.isEmpty()) return 0;
    if (!value.endsWith("%")) throw new IllegalArgumentException("Expected fractional inset: " + value);
    return Double.parseDouble(value.substring(0, value.length() - 1)) / 100;
  }
  static Layer drawable(String reference) throws Exception {
    if (!reference.startsWith("@drawable/")) throw new IllegalArgumentException(reference);
    var name = reference.substring("@drawable/".length());
    var png = res.resolve("drawable-nodpi/" + name + ".png");
    if (Files.exists(png)) return new Layer(ImageIO.read(png.toFile()), png, 0, 0, 0, 0, null);
    var root = xml(res.resolve("drawable/" + name + ".xml")).getDocumentElement();
    if (!root.getTagName().equals("inset")) throw new IllegalArgumentException("Unsupported drawable " + name);
    var bitmaps = root.getElementsByTagName("bitmap");
    if (bitmaps.getLength() != 1) throw new IllegalArgumentException("Expected one bitmap " + name);
    var bitmap = (Element)bitmaps.item(0);
    if (!attr(bitmap, "gravity").equals("fill")) throw new IllegalArgumentException("Bitmap must fill inset bounds");
    if (!attr(bitmap, "tintMode").equals("src_in")) throw new IllegalArgumentException("Tint must preserve source alpha");
    var source = drawable(attr(bitmap, "src"));
    var tint = attr(bitmap, "tint");
    if (!tint.matches("#[0-9a-fA-F]{8}")) throw new IllegalArgumentException("Expected explicit ARGB tint");
    return new Layer(source.image(), source.source(), inset(root, "Left"), inset(root, "Top"), inset(root, "Right"), inset(root, "Bottom"),
      (int)Long.parseLong(tint.substring(1), 16));
  }
  static void inspect(String icon, String kind, Layer layer) {
    var image = layer.image();
    double minX = 108, minY = 108, maxX = 0, maxY = 0, radius = 0;
    int visible = 0, transparent = 0, colored = 0;
    for (int y = 0; y < image.getHeight(); y++) for (int x = 0; x < image.getWidth(); x++) {
      int pixel = image.getRGB(x, y);
      int alpha = pixel >>> 24;
      if (alpha == 0) transparent++;
      if (alpha <= 8) continue;
      visible++;
      int color = layer.tint() == null ? pixel : layer.tint();
      if ((color & 0x00ffffff) != 0x00ffffff || (color >>> 24) != 255) colored++;
      double px = 108 * (layer.left() + (x + .5) / image.getWidth() * (1 - layer.left() - layer.right()));
      double py = 108 * (layer.top() + (y + .5) / image.getHeight() * (1 - layer.top() - layer.bottom()));
      minX = Math.min(minX, px); minY = Math.min(minY, py);
      maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
      radius = Math.max(radius, Math.hypot(px - 54, py - 54));
    }
    System.out.printf(Locale.ROOT, "%s|%s|%d|%d|%d|%.4f|%.4f|%.4f|%s%n",
      icon, kind, visible, transparent, colored, radius, maxX - minX, maxY - minY, res.relativize(layer.source()));
  }
  public static void main(String[] args) throws Exception {
    res = Path.of(args[0], "apps/v1_android/app/src/main/res");
    var manifest = xml(res.getParent().resolve("AndroidManifest.xml"));
    var application = (Element)manifest.getElementsByTagName("application").item(0);
    for (var entry : List.of("icon", "roundIcon")) {
      var reference = attr(application, entry);
      if (!reference.startsWith("@mipmap/")) throw new IllegalArgumentException(reference);
      var icon = reference.substring("@mipmap/".length());
      var adaptive = xml(res.resolve("mipmap-anydpi-v26/" + icon + ".xml")).getDocumentElement();
      if (!adaptive.getTagName().equals("adaptive-icon")) throw new IllegalArgumentException(icon);
      var background = (Element)adaptive.getElementsByTagName("background").item(0);
      if (!attr(background, "drawable").equals("@color/launcher_background")) throw new IllegalArgumentException("Separate background missing");
      for (var kind : List.of("foreground", "monochrome")) {
        var tag = (Element)adaptive.getElementsByTagName(kind).item(0);
        inspect(icon, kind, drawable(attr(tag, "drawable")));
      }
    }
  }
}
`);
  const output = execFileSync(java, [probe, repo], { encoding: 'utf8' }).trim();
  layers = output.split(/\r?\n/).map(line => {
    const [icon, kind, visible, transparent, colored, radius, width, height, source] = line.split('|');
    return { icon, kind, visible: Number(visible), transparent: Number(transparent), colored: Number(colored),
      radius: Number(radius), width: Number(width), height: Number(height), source };
  });
} finally {
  rmSync(temp, { recursive: true, force: true });
}

for (const layer of layers) {
  test(`${layer.icon} ${layer.kind} is a transparent white symbol inside the 66dp safe circle`, t => {
    t.diagnostic(JSON.stringify(layer));
    assert.ok(layer.visible > 0 && layer.transparent > 0, `Symbol/transparent pixels missing: ${JSON.stringify(layer)}`);
    assert.equal(layer.colored, 0, `Baked blue tile is being treated as symbol pixels: ${JSON.stringify(layer)}`);
    assert.ok(layer.radius <= 33, `Symbol can be clipped by the OEM mask: ${JSON.stringify(layer)}`);
    assert.ok(Math.max(layer.width, layer.height) >= 48, `Symbol has become too small: ${JSON.stringify(layer)}`);
  });
}

test('default and round icons expose the same foreground and monochrome alpha geometry', () => {
  const geometry = ({ icon, kind, ...metrics }) => metrics;
  assert.equal(layers.length, 4);
  for (const layer of layers.slice(1)) assert.deepEqual(geometry(layer), geometry(layers[0]));
});

test('Android launcher reuses the canonical transparent Teameet mark without redrawing pixels', () => {
  const canonical = readFileSync(path.join(repo, 'apps/v1_web/public/brand/teameet-mark.png'));
  for (const layer of layers) {
    assert.deepEqual(readFileSync(path.join(repo, 'apps/v1_android/app/src/main/res', layer.source)), canonical,
      `${layer.icon} ${layer.kind} points at different artwork`);
  }
});

// Evaluate the actual event filters with a one-file change, rather than searching
// the whole workflow for a path that could appear in a comment or another event.
const workflowLines = readFileSync(path.join(repo, '.github/workflows/android-alpha.yml'), 'utf8').split(/\r?\n/);
function workflowBlock(lines, key, indent) {
  const header = new RegExp(`^${' '.repeat(indent)}${key}:\\s*(?:#.*)?$`);
  const starts = lines.flatMap((line, index) => header.test(line) ? [index] : []);
  assert.equal(starts.length, 1, `Expected one workflow ${key} block`);
  const body = lines.slice(starts[0] + 1);
  const end = body.findIndex(line => line.trim() && !line.trimStart().startsWith('#') && line.search(/\S/) <= indent);
  return end < 0 ? body : body.slice(0, end);
}

function workflowScalar(value) {
  const scalar = value.trim().replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
  assert.match(scalar, /^[!a-zA-Z0-9_./*-]+$/, `Unsupported workflow filter scalar: ${value}`);
  return scalar;
}

function eventFilters(event) {
  const body = workflowBlock(workflowBlock(workflowLines, 'on', 0), event, 2);
  assert.ok(!body.some(line => /^    (?:paths-ignore|branches-ignore):/.test(line)), 'Unexpected exclusion-only filter');
  const branches = body.filter(line => /^    branches:/.test(line));
  assert.equal(branches.length, 1, `${event} needs a branch filter`);
  const branchList = branches[0].match(/^    branches:\s*\[([^\]]+)\]\s*(?:#.*)?$/);
  assert.ok(branchList, `${event} uses an unsupported branch list`);
  const paths = workflowBlock(body, 'paths', 4).filter(line => line.trim() && !line.trimStart().startsWith('#')).map(line => {
    const entry = line.match(/^      - (.+)$/);
    assert.ok(entry, `Unsupported workflow path entry: ${line}`);
    return workflowScalar(entry[1]);
  });
  assert.ok(paths.length > 0, `${event} needs path filters`);
  return { branches: branchList[1].split(',').map(workflowScalar), paths };
}

function filterAccepts(patterns, value) {
  let included = false;
  for (const raw of patterns) {
    const excluded = raw.startsWith('!');
    const pattern = excluded ? raw.slice(1) : raw;
    // Current workflow uses literals and trailing /**. Fail closed on new syntax
    // until this contract evaluator supports it; preserve GitHub's pattern order.
    assert.ok(!pattern.includes('*') || pattern.endsWith('/**') && !pattern.slice(0, -3).includes('*'),
      `Unsupported workflow filter pattern: ${raw}`);
    const matches = pattern.endsWith('/**') ? value.startsWith(pattern.slice(0, -2)) : value === pattern;
    if (matches) included = !excluded;
  }
  return included;
}

for (const event of ['pull_request', 'push']) {
  test(`Android Alpha ${event} to dev runs for a canonical mark-only change`, () => {
    const filters = eventFilters(event);
    const runsFor = (branch, changedFiles) => filterAccepts(filters.branches, branch)
      && changedFiles.some(file => filterAccepts(filters.paths, file));
    assert.equal(runsFor('dev', ['apps/v1_android/app/src/main/AndroidManifest.xml']), true);
    assert.equal(runsFor('dev', ['docs/README.md']), false);
    assert.equal(runsFor('main', ['apps/v1_web/public/brand/teameet-mark.png']), false);
    assert.equal(runsFor('dev', ['apps/v1_web/public/brand/teameet-mark.png']), true,
      `${event} skips the canonical artwork dependency: ${JSON.stringify(filters)}`);
  });
}
