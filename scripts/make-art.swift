// Draws the icon (public/icon.png), the README demo (public/demo.gif) and the link preview image
// (public/social.png). Everything is drawn here, never recorded, and the data in it is made up:
// the same blobs and waves as public/example.h5.
//
//   swift scripts/make-art.swift
import AppKit
import ImageIO
import UniformTypeIdentifiers

let ink = NSColor(srgbRed: 0.05, green: 0.06, blue: 0.07, alpha: 1)
let ice = NSColor(srgbRed: 0.62, green: 0.82, blue: 1.0, alpha: 1)
let slate = NSColor(srgbRed: 0.13, green: 0.17, blue: 0.27, alpha: 1)

func bitmap(_ width: Int, _ height: Int, draw: () -> Void) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    )!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw()
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

/// Made-up blobs, like the example file's mean frame, from 0 to about 1.
func blobs(_ x: Double, _ y: Double, shift: Double = 0) -> Double {
    let centers: [(Double, Double, Double)] = [(40, 50, 12), (90, 80, 18), (70, 30, 7)]
    var sum = 0.0
    for (cx, cy, s) in centers {
        let dx = x - cx - shift
        let dy = y - cy
        sum += exp(-(dx * dx + dy * dy) / (2 * s * s))
    }
    return sum
}

/// A cool colormap from slate to ice to white.
func shade(_ v: Double) -> NSColor {
    let t = CGFloat(min(max(v, 0), 1))
    return NSColor(srgbRed: 0.10 + 0.85 * t * t, green: 0.13 + 0.75 * t, blue: 0.25 + 0.75 * sqrt(t), alpha: 1)
}

func heatmap(in rect: NSRect, shift: Double = 0, cells: Int = 64) {
    let w = rect.width / CGFloat(cells), h = rect.height / CGFloat(cells)
    for i in 0..<cells {
        for j in 0..<cells {
            shade(blobs(Double(i) * 128 / Double(cells), Double(j) * 128 / Double(cells), shift: shift)).setFill()
            NSRect(x: rect.minX + CGFloat(i) * w, y: rect.minY + CGFloat(j) * h, width: w + 0.5, height: h + 0.5).fill()
        }
    }
}

// MARK: Icon

/// Three stacked slices of an array on a slate tile, with an ice-blue arrow dropping onto them.
func icon(pixels: Int) -> NSBitmapImageRep {
    bitmap(pixels, pixels) {
        let scale = NSAffineTransform()
        scale.scale(by: CGFloat(pixels) / 1024)
        scale.concat()
        let tile = NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 185, yRadius: 185)
        NSGraphicsContext.saveGraphicsState()
        let tileShadow = NSShadow()
        tileShadow.shadowColor = .black.withAlphaComponent(0.3)
        tileShadow.shadowBlurRadius = 24
        tileShadow.shadowOffset = NSSize(width: 0, height: -12)
        tileShadow.set()
        slate.setFill()
        tile.fill()
        NSGraphicsContext.restoreGraphicsState()
        NSGradient(colors: [
            NSColor(srgbRed: 0.80, green: 0.87, blue: 0.96, alpha: 1),
            NSColor(srgbRed: 0.45, green: 0.57, blue: 0.75, alpha: 1),
            slate,
        ])!.draw(in: tile, angle: -90)

        // The slices, as slanted sheets, back to front; the front one shows the blobs.
        func sheet(_ dy: CGFloat) -> NSBezierPath {
            let p = NSBezierPath()
            p.move(to: NSPoint(x: 250, y: 250 + dy))
            p.line(to: NSPoint(x: 640, y: 250 + dy))
            p.line(to: NSPoint(x: 774, y: 400 + dy))
            p.line(to: NSPoint(x: 384, y: 400 + dy))
            p.close()
            return p
        }
        for (i, dy) in [CGFloat(220), 110, 0].enumerated() {
            let path = sheet(dy)
            NSGraphicsContext.saveGraphicsState()
            let shadow = NSShadow()
            shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
            shadow.shadowBlurRadius = 20
            shadow.shadowOffset = NSSize(width: 0, height: -8)
            shadow.set()
            NSColor.white.withAlphaComponent(i == 2 ? 0.97 : 0.55 + 0.15 * CGFloat(i)).setFill()
            path.fill()
            NSGraphicsContext.restoreGraphicsState()
            if i == 2 {
                NSGraphicsContext.saveGraphicsState()
                path.addClip()
                let bounds = path.bounds.insetBy(dx: 0, dy: 0)
                let transform = NSAffineTransform()
                transform.translateX(by: bounds.minX, yBy: bounds.minY)
                transform.concat()
                let skew = NSAffineTransform(transform: AffineTransform(m11: 1, m12: 0, m21: 0.89, m22: 1, tX: 0, tY: 0))
                skew.concat()
                for j in 0..<10 {
                    for k in 0..<26 {
                        let v = blobs(Double(k) * 5, Double(j) * 13)
                        shade(v).withAlphaComponent(0.25 + 0.75 * CGFloat(min(v, 1))).setFill()
                        NSRect(x: CGFloat(k) * 15, y: CGFloat(j) * 15, width: 15.5, height: 15.5).fill()
                    }
                }
                NSGraphicsContext.restoreGraphicsState()
            }
        }

        NSGraphicsContext.saveGraphicsState()
        let glow = NSShadow()
        glow.shadowColor = ice.withAlphaComponent(0.8)
        glow.shadowBlurRadius = 30
        glow.set()
        ice.setStroke()
        ice.setFill()
        let shaft = NSBezierPath()
        shaft.move(to: NSPoint(x: 512, y: 850))
        shaft.line(to: NSPoint(x: 512, y: 720))
        shaft.lineWidth = 50
        shaft.lineCapStyle = .round
        shaft.stroke()
        let head = NSBezierPath()
        head.move(to: NSPoint(x: 432, y: 720))
        head.line(to: NSPoint(x: 592, y: 720))
        head.line(to: NSPoint(x: 512, y: 640))
        head.close()
        head.lineWidth = 22
        head.lineJoinStyle = .round
        head.fill()
        head.stroke()
        NSGraphicsContext.restoreGraphicsState()
    }
}

try icon(pixels: 256).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "public/icon.png"))

// MARK: Demo and social image

func wallpaper(_ rect: NSRect) {
    NSGradient(starting: NSColor(srgbRed: 0.08, green: 0.09, blue: 0.13, alpha: 1), ending: ink)!.draw(in: rect, angle: -90)
    for (x, y, r, color) in [
        (0.18, 0.75, 0.42, NSColor(srgbRed: 0.84, green: 0.89, blue: 0.95, alpha: 0.45)),
        (0.85, 0.72, 0.38, NSColor(srgbRed: 0.59, green: 0.68, blue: 0.81, alpha: 0.40)),
        (0.70, 0.12, 0.46, NSColor(srgbRed: 0.75, green: 0.81, blue: 0.89, alpha: 0.32)),
    ] as [(CGFloat, CGFloat, CGFloat, NSColor)] {
        let center = NSPoint(x: rect.minX + rect.width * x, y: rect.minY + rect.height * y)
        NSGradient(starting: color, ending: color.withAlphaComponent(0))!.draw(fromCenter: center, radius: 0, toCenter: center, radius: rect.width * r, options: [])
    }
}

@discardableResult
func text(_ string: String, at point: NSPoint, size: CGFloat, weight: NSFont.Weight = .regular, color: NSColor = .white, centered: Bool = false, mono: Bool = false) -> CGFloat {
    let font = mono ? NSFont.monospacedSystemFont(ofSize: size, weight: weight) : NSFont.systemFont(ofSize: size, weight: weight)
    let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
    let width = (string as NSString).size(withAttributes: attributes).width
    (string as NSString).draw(at: NSPoint(x: centered ? point.x - width / 2 : point.x, y: point.y), withAttributes: attributes)
    return width
}

let W: CGFloat = 720, H: CGFloat = 450
let dark = NSColor(srgbRed: 0.09, green: 0.10, blue: 0.12, alpha: 1)

/// A drawn browser window. `content` draws inside the page area.
func browser(_ content: (NSRect) -> Void) -> NSBitmapImageRep {
    bitmap(Int(W), Int(H)) {
        wallpaper(NSRect(x: 0, y: 0, width: W, height: H))
        let frame = NSRect(x: 26, y: 24, width: 668, height: 400)
        NSGraphicsContext.saveGraphicsState()
        let shadow = NSShadow()
        shadow.shadowColor = .black.withAlphaComponent(0.55)
        shadow.shadowBlurRadius = 26
        shadow.shadowOffset = NSSize(width: 0, height: -10)
        shadow.set()
        dark.setFill()
        NSBezierPath(roundedRect: frame, xRadius: 12, yRadius: 12).fill()
        NSGraphicsContext.restoreGraphicsState()
        for (i, color) in [NSColor.systemRed, .systemYellow, .systemGreen].enumerated() {
            color.setFill()
            NSBezierPath(ovalIn: NSRect(x: frame.minX + 16 + CGFloat(i) * 20, y: frame.maxY - 24, width: 12, height: 12)).fill()
        }
        NSColor.white.withAlphaComponent(0.08).setFill()
        NSBezierPath(roundedRect: NSRect(x: frame.minX + 110, y: frame.maxY - 29, width: 420, height: 22), xRadius: 11, yRadius: 11).fill()
        text("stanczykwyatt.github.io/dropslice", at: NSPoint(x: frame.minX + 124, y: frame.maxY - 25), size: 11.5, color: .white.withAlphaComponent(0.6))
        let page = NSRect(x: frame.minX, y: frame.minY, width: frame.width, height: frame.height - 38)
        NSGraphicsContext.saveGraphicsState()
        NSBezierPath(roundedRect: page, xRadius: 12, yRadius: 12).addClip()
        content(page)
        NSGraphicsContext.restoreGraphicsState()
    }
}

func dropPage(_ page: NSRect, fileAt: NSPoint?, over: Bool) {
    wallpaper(page)
    let zone = NSRect(x: page.midX - 230, y: page.minY + 60, width: 460, height: 200)
    (over ? ice.withAlphaComponent(0.14) : NSColor.white.withAlphaComponent(0.04)).setFill()
    let path = NSBezierPath(roundedRect: zone, xRadius: 20, yRadius: 20)
    path.fill()
    (over ? ice : NSColor.white.withAlphaComponent(0.45)).setStroke()
    path.setLineDash([7, 6], count: 2, phase: 0)
    path.lineWidth = 1.5
    path.stroke()
    text("dropslice", at: NSPoint(x: page.midX, y: page.maxY - 60), size: 30, weight: .semibold, centered: true)
    text("Open NWB, HDF5, MATLAB, NumPy and Zarr files in your browser.", at: NSPoint(x: page.midX, y: page.maxY - 86), size: 13, color: .white.withAlphaComponent(0.7), centered: true)
    text("Drop a file or a .zarr folder here", at: NSPoint(x: zone.midX, y: zone.midY + 22), size: 17, weight: .semibold, centered: true)
    text(".nwb · .h5 · .mat · .npy · .npz · .zarr", at: NSPoint(x: zone.midX, y: zone.midY - 6), size: 12.5, color: .white.withAlphaComponent(0.65), centered: true)
    if let p = fileAt {
        let card = NSRect(x: p.x, y: p.y, width: 120, height: 34)
        NSColor.white.setFill()
        NSBezierPath(roundedRect: card, xRadius: 8, yRadius: 8).fill()
        text("session.mat", at: NSPoint(x: card.minX + 12, y: card.minY + 10), size: 13, weight: .medium, color: ink)
    }
}

func viewerPage(_ page: NSRect, selected: String, plot: (NSRect) -> Void) {
    NSColor(srgbRed: 0.97, green: 0.98, blue: 0.96, alpha: 1).setFill()
    page.fill()
    ink.setFill()
    NSRect(x: page.minX, y: page.maxY - 30, width: page.width, height: 30).fill()
    text("session.mat", at: NSPoint(x: page.minX + 14, y: page.maxY - 21), size: 12.5, weight: .semibold)
    text("MATLAB 5.0 MAT-file · read in your browser, nothing uploaded", at: NSPoint(x: page.minX + 100, y: page.maxY - 21), size: 12, color: .white.withAlphaComponent(0.6))
    let sidebar = NSRect(x: page.minX, y: page.minY, width: 160, height: page.height - 30)
    NSColor(srgbRed: 0.93, green: 0.95, blue: 0.90, alpha: 1).setFill()
    sidebar.fill()
    for (i, name) in ["frames", "lfp", "spike_times", "info", "trials", "name"].enumerated() {
        let y = sidebar.maxY - 40 - CGFloat(i) * 28
        if name == selected {
            NSColor(srgbRed: 0.76, green: 0.85, blue: 0.45, alpha: 1).setFill()
            NSRect(x: sidebar.minX, y: y - 7, width: sidebar.width, height: 26).fill()
        }
        text(["info", "trials"].contains(name) ? "›  \(name)" : "▦  \(name)", at: NSPoint(x: sidebar.minX + 14, y: y), size: 13, weight: name == selected ? .semibold : .regular, color: ink)
    }
    plot(NSRect(x: sidebar.maxX + 30, y: page.minY + 24, width: page.maxX - sidebar.maxX - 60, height: page.height - 80))
}

func linePlot(_ r: NSRect) {
    NSColor.black.withAlphaComponent(0.15).setStroke()
    NSBezierPath.strokeLine(from: NSPoint(x: r.minX, y: r.minY), to: NSPoint(x: r.maxX, y: r.minY))
    for (k, color) in [NSColor(srgbRed: 0.18, green: 0.35, blue: 0.62, alpha: 1), NSColor(srgbRed: 0.35, green: 0.65, blue: 0.85, alpha: 1)].enumerated() {
        let path = NSBezierPath()
        for i in 0...300 {
            let t = Double(i) / 50
            let v = sin(2 * .pi * Double(6 + k) * t / 3) * exp(-pow(t - 1.5 * Double(k + 2), 2)) + 0.3 * sin(2 * .pi * 4 * t + Double(k))
            let p = NSPoint(x: r.minX + CGFloat(i) / 300 * r.width, y: r.midY + CGFloat(v) * r.height * 0.32 + CGFloat(k) * 6)
            i == 0 ? path.move(to: p) : path.line(to: p)
        }
        color.setStroke()
        path.lineWidth = 1.6
        path.stroke()
    }
    text("lfp  [6000 × 4] float32, mV", at: NSPoint(x: r.minX, y: r.maxY + 4), size: 12, weight: .medium, color: ink)
}

var frames: [(NSBitmapImageRep, Double)] = []
frames.append((browser { dropPage($0, fileAt: nil, over: false) }, 1.0))
for step in 0..<6 {
    let t = CGFloat(step) / 5
    frames.append((browser { page in dropPage(page, fileAt: NSPoint(x: page.minX + 480 - 200 * t, y: page.minY + 300 - 150 * t), over: step >= 4) }, 0.12))
}
frames.append((browser { dropPage($0, fileAt: NSPoint(x: $0.minX + 280, y: $0.minY + 150), over: true) }, 0.5))
for shift in stride(from: 0.0, through: 36.0, by: 6.0) {
    frames.append((browser { page in
        viewerPage(page, selected: "frames") { r in
            let square = NSRect(x: r.minX + (r.width - r.height) / 2, y: r.minY, width: r.height, height: r.height)
            heatmap(in: square, shift: shift)
            text("frames  [10 × 128 × 128] float32 · slice \(Int(shift / 4))", at: NSPoint(x: square.minX, y: square.maxY + 4), size: 12, weight: .medium, color: ink)
        }
    }, shift == 0 ? 1.4 : 0.35))
}
frames.append((browser { viewerPage($0, selected: "lfp", plot: linePlot) }, 3.0))

let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "public/demo.gif") as CFURL, UTType.gif.identifier as CFString, frames.count, nil)!
CGImageDestinationSetProperties(destination, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
for (rep, hold) in frames {
    CGImageDestinationAddImage(destination, rep.cgImage!, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: hold]] as CFDictionary)
}
guard CGImageDestinationFinalize(destination) else { fatalError("Couldn't write the GIF") }

let social = bitmap(1280, 640) {
    wallpaper(NSRect(x: 0, y: 0, width: 1280, height: 640))
    NSImage(contentsOfFile: "public/icon.png")!.draw(in: NSRect(x: 96, y: 380, width: 140, height: 140))
    text("dropslice", at: NSPoint(x: 96, y: 270), size: 80, weight: .semibold)
    text("Open NWB, HDF5, MATLAB, NumPy and Zarr files in your browser.", at: NSPoint(x: 100, y: 214), size: 30, color: .white.withAlphaComponent(0.85))
    text("Plots, images and tables. Nothing is uploaded.", at: NSPoint(x: 100, y: 164), size: 22, color: ice)
    text(".nwb · .h5 · .mat · .npy · .npz · .zarr · free and open source", at: NSPoint(x: 100, y: 100), size: 17, color: .white.withAlphaComponent(0.5), mono: true)
    heatmap(in: NSRect(x: 860, y: 300, width: 300, height: 300), shift: 8, cells: 80)
}
try social.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "public/social.png"))
Swift.print("Wrote public/icon.png, public/demo.gif and public/social.png")
