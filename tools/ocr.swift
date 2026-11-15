import Vision; import AppKit
// In ra toàn bộ dòng chữ nhận dạng được của 1 ảnh (Vision, chạy cục bộ)
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let req = VNRecognizeTextRequest(); req.recognitionLevel = .accurate; req.usesLanguageCorrection = false; req.recognitionLanguages = ["vi-VN","en-US"]
try VNImageRequestHandler(cgImage: cg).perform([req])
for o in (req.results ?? []) { if let t = o.topCandidates(1).first { print(t.string) } }
