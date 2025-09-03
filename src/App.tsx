import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker?url";
import PptxGenJS from "pptxgenjs";
import { Upload, Lock, FileText, Camera, Monitor } from "lucide-react";

// Required for pdfjs worker
// pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorker;

const PX_PER_INCH = 96; // standard CSS px per inch

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isConverting, setIsConverting] = useState<boolean>(false);

  const pushLog = (msg: string) => {
    console.log(msg);
  };

  const convertPdfToPpt = async (file: File) => {
    pushLog(`Starting conversion for file: ${file.name}`);
    setFile(file);
    setIsConverting(true);
    setProgress(0);

    try {
      const arrayBuffer = await file.arrayBuffer();
      pushLog("Loading PDF into pdf.js...");
      const pdf = await (pdfjsLib as any).getDocument({ data: arrayBuffer }).promise;
      pushLog(`PDF loaded. Page count: ${pdf.numPages}`);

      const pptx = new PptxGenJS();

      // slide width/height (inches)
      const slideW = typeof (pptx as any).width === "number" ? (pptx as any).width : 10;
      const slideH = typeof (pptx as any).height === "number" ? (pptx as any).height : 5.625;
      pushLog(`PPT slide size (inches): ${slideW} x ${slideH}`);

      for (let i = 1; i <= pdf.numPages; i++) {
        pushLog(`Rendering page ${i} / ${pdf.numPages} ...`);
        const page = await pdf.getPage(i);

        // original dimensions at scale=1 (PDF units)
        const unscaledViewport = page.getViewport({ scale: 1 });
        const origPagePxW = unscaledViewport.width; // page width in "PDF points" ~ CSS px when scale=1
        const origPagePxH = unscaledViewport.height;

        // Target canvas width in pixels = slideWidth_inches * px_per_inch (choose DPI here)
        const targetCanvasPxW = Math.round(slideW * PX_PER_INCH);

        // Compute scale to render canvas at this width
        const scale = targetCanvasPxW / origPagePxW;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        // render page into canvas
        await page.render({ canvasContext: ctx, viewport }).promise;

        pushLog(`Rendered canvas size (px): ${canvas.width} x ${canvas.height}`);

        // Convert canvas -> image data URL
        const imgData = canvas.toDataURL("image/png");

        // Convert canvas px -> inches (use same PX_PER_INCH)
        const imgInchesW = canvas.width / PX_PER_INCH;
        const imgInchesH = canvas.height / PX_PER_INCH;
        pushLog(`Image size (inches): ${imgInchesW.toFixed(2)} x ${imgInchesH.toFixed(2)}`);

        // Fit into slide while preserving aspect ratio
        const slideRatio = slideW / slideH;
        const imgRatio = imgInchesW / imgInchesH;

        let finalW = 0;
        let finalH = 0;
        let offsetX = 0;
        let offsetY = 0;

        if (imgRatio > slideRatio) {
          // image is relatively wider -> fit to slide width
          finalW = slideW;
          finalH = slideW / imgRatio;
          offsetX = 0;
          offsetY = (slideH - finalH) / 2;
        } else {
          // image is relatively taller -> fit to slide height
          finalH = slideH;
          finalW = slideH * imgRatio;
          offsetY = 0;
          offsetX = (slideW - finalW) / 2;
        }

        // Round to 2 decimals (pptxgenjs is fine with floats)
        finalW = Math.round(finalW * 100) / 100;
        finalH = Math.round(finalH * 100) / 100;
        offsetX = Math.round(offsetX * 100) / 100;
        offsetY = Math.round(offsetY * 100) / 100;

        pushLog(
          `Placing image on slide: x=${offsetX}in y=${offsetY}in w=${finalW}in h=${finalH}in`
        );

        const slide = pptx.addSlide();
        slide.addImage({
          data: imgData,
          x: offsetX,
          y: offsetY,
          w: finalW,
          h: finalH,
        });

        // update progress
        setProgress(Math.round((i / pdf.numPages) * 100));
      }

      pushLog("All pages processed. Generating PPTX...");
      const outName = file.name.toLowerCase().endsWith(".pdf")
        ? file.name.replace(/\.pdf$/i, ".pptx")
        : file.name + ".pptx";

      await pptx.writeFile({ fileName: outName });
      pushLog("Download triggered: " + outName);
    } catch (err) {
      console.error(err);
      pushLog("ERROR: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsConverting(false);
      setProgress(100);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const selectedFile = event.target.files[0];
      setFile(selectedFile);
      convertPdfToPpt(selectedFile);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gradient-to-br from-purple-100 to-purple-200 text-gray-800">
      {/* Top Badge */}
      <div className="mt-6 flex items-center gap-2 px-4 py-1 bg-white/80 rounded-full text-sm font-medium shadow">
        <Lock className="w-4 h-4 text-purple-600" />
        100% Private - All processing happens locally
      </div>

      {/* Title + Subtitle */}
      <div className="text-center mt-8">
        <h1 className="text-3xl font-bold">PDF to PPT Converter</h1>
        <p className="mt-2 text-gray-700">
          Transform your PDF documents into PowerPoint presentations instantly.
          All processing happens locally in your browser for complete privacy.
        </p>
      </div>

      {/* Upload Box */}
      <div className="w-full max-w-xl mt-8">
        <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-purple-400 rounded-2xl cursor-pointer bg-white hover:bg-purple-50 transition">
          <Upload className="w-10 h-10 text-purple-600 mb-3" />
          <p className="text-lg font-medium text-gray-800">Drop your PDF here</p>
          <p className="text-sm text-gray-500">or click to browse files</p>
          <input type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
        </label>
        {file && <p className="mt-2 text-center text-sm text-gray-600">Selected: {file.name}</p>}
      </div>

      {/* Progress Bar */}
      {isConverting && (
        <div className="w-full max-w-md mt-6">
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-purple-600 h-4 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="mt-2 text-center text-sm text-gray-700">
            Converting... {progress}%
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        <div>
          <FileText className="mx-auto w-10 h-10 text-purple-600 mb-2" />
          <p className="font-semibold">Upload PDF</p>
          <p className="text-sm text-gray-600">Select your PDF document</p>
        </div>
        <div>
          <Camera className="mx-auto w-10 h-10 text-purple-600 mb-2" />
          <p className="font-semibold">Capture Pages</p>
          <p className="text-sm text-gray-600">Each page is converted to an image</p>
        </div>
        <div>
          <Monitor className="mx-auto w-10 h-10 text-purple-600 mb-2" />
          <p className="font-semibold">Generate PPT</p>
          <p className="text-sm text-gray-600">Images are compiled into a PowerPoint</p>
        </div>
      </div>

      {/* Note */}
      <div className="mt-12 max-w-2xl bg-white rounded-xl shadow p-4 text-center text-gray-700 text-sm">
        <strong>How it works:</strong> Each page of your PDF is captured as a
        high-quality image, then compiled into a PowerPoint presentation. This
        ensures perfect visual fidelity while maintaining your document's layout.
      </div>

      {/* Footer */}
      <div className="mt-8 mb-6 text-gray-600 text-sm">
        Made with ❤️ for privacy and simplicity
      </div>
    </div>
  );
};

export default App;
