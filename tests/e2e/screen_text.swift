// Offline observation only: no input injection, network, or accessibility permissions.
import Foundation
import Vision

if CommandLine.arguments.count != 2 {
    fputs("Usage: screen-text FULL_WINDOW.png\n", stderr)
    exit(2)
}

do {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    try VNImageRequestHandler(url: url, options: [:]).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    let data = try JSONSerialization.data(withJSONObject: lines)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    fputs("Cannot observe screenshot text: \(error)\n", stderr)
    exit(1)
}
