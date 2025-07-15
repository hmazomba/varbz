
import React, { useState, useCallback, useRef, useEffect } from 'react';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import Button from './components/Button';
import { DownloadIcon, SparklesIcon, FolderOpenIcon, DocumentTextIcon, GlobeAltIcon, KeyIcon } from './components/Icons';

interface AppFile {
  id: string;
  name: string;
  content: string;
  selected: boolean;
  fileObject: File;
}

interface TavilyCrawlResult {
  url: string;
  raw_content: string;
}

interface TavilyCrawlResponse {
  base_url?: string;
  results?: TavilyCrawlResult[];
  response_time?: number;
  error?: string;
  detail?: any;
}

type DownloadFormat = 'pdf' | 'txt' | 'both';

const generatePdfBlob = (content: string): Blob => {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15; // mm
  const usableWidth = pageWidth - 2 * margin;
  const fontSize = 11;
  const lineHeightFactor = 1.35;
  const lineSpacing = fontSize * lineHeightFactor / doc.internal.scaleFactor;

  doc.setFontSize(fontSize);
  let cursorY = margin;
  const lines = doc.splitTextToSize(content, usableWidth);

  lines.forEach((line: string) => {
    if (cursorY + lineSpacing > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
    }
    doc.text(line, margin, cursorY);
    cursorY += lineSpacing;
  });

  return doc.output('blob');
};

const App: React.FC = () => {
  const [filesData, setFilesData] = useState<AppFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReadingFiles, setIsReadingFiles] = useState<boolean>(false);
  const [isCrawlingUrl, setIsCrawlingUrl] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>('');
  const [tavilyApiKey, setTavilyApiKey] = useState<string>('');
  const [crawlLimit, setCrawlLimit] = useState<number>(50);
  const [error, setError] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState<boolean>(true);
  const [zipMultipleFiles, setZipMultipleFiles] = useState<boolean>(true);
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>('pdf');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedApiKey = localStorage.getItem('tavilyApiKey');
    if (storedApiKey) {
      setTavilyApiKey(storedApiKey);
    }
  }, []);

  const handleTavilyApiKeyChange = (key: string) => {
    setTavilyApiKey(key);
    localStorage.setItem('tavilyApiKey', key);
    if (error) setError(null);
  };

  const handleFileSelectionChange = useCallback((id: string) => {
    setFilesData(prevFiles => {
      const newFiles = prevFiles.map(file =>
        file.id === id ? { ...file, selected: !file.selected } : file
      );
      const allSelected = newFiles.length > 0 && newFiles.every(file => file.selected);
      setSelectAll(allSelected);
      return newFiles;
    });
    if (error) setError(null);
  }, [error]);

  const handleSelectAllChange = useCallback(() => {
    const newSelectAllState = !selectAll;
    setSelectAll(newSelectAllState);
    setFilesData(prevFiles =>
      prevFiles.map(file => ({ ...file, selected: newSelectAllState }))
    );
    if (error) setError(null);
  }, [selectAll, error]);

  const handleFilesUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedHtmlFiles = event.target.files;
    if (!selectedHtmlFiles || selectedHtmlFiles.length === 0) {
      return;
    }

    setIsReadingFiles(true);
    setError(null);
    const newFilesData: AppFile[] = [];
    let txtFileFound = false;

    for (let i = 0; i < selectedHtmlFiles.length; i++) {
      const file = selectedHtmlFiles[i];
      if (file.name.endsWith('.txt') && file.type === 'text/plain') {
        txtFileFound = true;
        try {
          const content = await file.text();
          newFilesData.push({
            id: crypto.randomUUID(),
            name: file.name,
            content: content,
            selected: true,
            fileObject: file,
          });
        } catch (e) {
          console.error(`Error reading file ${file.name}:`, e);
          setError(`Error reading file ${file.name}. It might be corrupted or too large.`);
        }
      }
    }

    setFilesData(prevFiles => {
      const combinedFiles = [...prevFiles, ...newFilesData];
      const uniqueFiles = combinedFiles.filter((v,i,a)=>a.findIndex(t=>(t.name === v.name && t.fileObject.lastModified === v.fileObject.lastModified))===i);

      if (!txtFileFound && newFilesData.length === 0 && selectedHtmlFiles.length > 0) {
         setError('No .txt files found in the selection. Please select .txt files only.');
      } else if (uniqueFiles.length === 0 && txtFileFound) {
         setError('Could not read any of the selected .txt files, or they were empty.');
      } else if (uniqueFiles.length === prevFiles.length && newFilesData.length > 0 && txtFileFound) {
        setError('All selected .txt files are already in the list.');
      }

      const allSelected = uniqueFiles.length > 0 && uniqueFiles.every(f => f.selected);
      setSelectAll(allSelected);
      return uniqueFiles;
    });
    setIsReadingFiles(false);

    if (event.target) {
      event.target.value = '';
    }
  }, []);

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const generateAndDownload = useCallback(async () => {
    const selectedFiles = filesData.filter(file => file.selected);
    if (selectedFiles.length === 0) {
      setError('Please select at least one file to process.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const actualShouldZip = zipMultipleFiles && 
        (selectedFiles.length > 1 || (selectedFiles.length === 1 && downloadFormat === 'both'));

      if (actualShouldZip) {
        const zip = new JSZip();
        for (const appFile of selectedFiles) {
          const baseFilename = appFile.name.replace(/\.txt$/, '');
          if (downloadFormat === 'pdf' || downloadFormat === 'both') {
            const pdfBlob = generatePdfBlob(appFile.content);
            zip.file(`${baseFilename}.pdf`, pdfBlob);
          }
          if (downloadFormat === 'txt' || downloadFormat === 'both') {
            const txtBlob = new Blob([appFile.content], { type: 'text/plain' });
            zip.file(appFile.name, txtBlob);
          }
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        let zipFilename = 'krwlr_documents.zip';
        if (downloadFormat === 'pdf') zipFilename = 'krwlr_pdfs.zip';
        else if (downloadFormat === 'txt') zipFilename = 'krwlr_texts.zip';
        downloadBlob(zipBlob, zipFilename);
      } else { // Individual downloads
        for (const appFile of selectedFiles) {
          const baseFilename = appFile.name.replace(/\.txt$/, '');
          if (downloadFormat === 'pdf' || downloadFormat === 'both') {
            const pdfBlob = generatePdfBlob(appFile.content);
            downloadBlob(pdfBlob, `${baseFilename}.pdf`);
          }
          if (downloadFormat === 'txt' || downloadFormat === 'both') {
            const txtBlob = new Blob([appFile.content], { type: 'text/plain' });
            downloadBlob(txtBlob, appFile.name);
          }
        }
      }
    } catch (e) {
      console.error("Error during download process:", e);
      setError('Failed to generate or download files. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [filesData, zipMultipleFiles, downloadFormat]);

  const handleCrawlUrlContent = useCallback(async () => {
    if (!urlInput.trim()) {
      setError("Please enter a valid URL.");
      return;
    }
    if (!tavilyApiKey.trim()) {
      setError("Please enter your Tavily API Key below to crawl URL content.");
      return;
    }
    if (crawlLimit < 1) {
      setError("Crawl limit must be at least 1.");
      return;
    }

    let processedUrl = urlInput.trim();
    if (!processedUrl.match(/^https?:\/\//i)) {
        processedUrl = `https://${processedUrl}`;
    }

    setIsCrawlingUrl(true);
    setError(null);

    const requestBody = {
      url: processedUrl,
      max_depth: 1,
      include_images: false,
      extract_depth: "basic",
      limit: crawlLimit,
    };

    try {
      const response = await fetch('https://api.tavily.com/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tavilyApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseData: TavilyCrawlResponse = await response.json();

      if (!response.ok) {
        let errMsg = `Tavily API error: ${response.status} ${response.statusText}.`;
        if (responseData && responseData.error) {
           errMsg += ` Details: ${responseData.error}`;
        } else if (responseData && responseData.detail) {
           errMsg += ` Details: ${Array.isArray(responseData.detail) ? responseData.detail.map(d => d.msg || JSON.stringify(d)).join(', ') : JSON.stringify(responseData.detail)}`;
        }
        if (response.status === 401) {
            errMsg += " Please check your Tavily API key."
        }
        throw new Error(errMsg);
      }

      let extractedText = "";
      if (responseData.results && Array.isArray(responseData.results) && responseData.results.length > 0) {
        let combinedText = "";
        for (const result of responseData.results) {
          if (result.raw_content && typeof result.raw_content === 'string') {
            combinedText += result.raw_content + "\n\n";
          }
        }
        extractedText = combinedText.trim();
      } else {
        setError("Tavily API did not return any crawl results or meaningful content for this URL.");
        setIsCrawlingUrl(false);
        return;
      }

      if (!extractedText) {
        setError("Tavily API did not return meaningful text content for this URL, or content was empty after processing.");
        setIsCrawlingUrl(false);
        return;
      }

      let filename = "crawled_content.txt";
      try {
        const urlObj = new URL(processedUrl);
        const sanePathname = (urlObj.pathname.replace(/\/$/, '') || '').replace(/\//g, '_');
        filename = `${urlObj.hostname}${sanePathname}.txt`.replace(/[^\w.-]/g, '_').replace(/__/g, '_');
        if (filename.length > 60) filename = filename.substring(Math.max(0, filename.length - 60));
        if (filename === "_.txt" || filename.startsWith("_.") || filename.startsWith("-.txt") || filename.length < 5 ) {
            filename = `content_from_${urlObj.hostname || 'webpage'}.txt`.replace(/[^\w.-]/g, '_').replace(/__/g, '_');
        }
        if (filename.length > 60) filename = filename.substring(Math.max(0, filename.length - 60));
      } catch (e) {
        console.warn("Could not parse URL for filename, using default.", e);
      }

      const newFile = new File([extractedText], filename, { type: 'text/plain', lastModified: Date.now() });
      const newAppFile: AppFile = {
        id: crypto.randomUUID(),
        name: newFile.name,
        content: extractedText,
        selected: true,
        fileObject: newFile,
      };

      setFilesData(prevFiles => {
        const combinedFiles = [...prevFiles, newAppFile];
        const uniqueFiles = combinedFiles.filter((v,i,a)=>a.findIndex(t=>(t.name === v.name && t.content === v.content))===i);
        const allSelected = uniqueFiles.length > 0 && uniqueFiles.every(f => f.selected);
        setSelectAll(allSelected);
        return uniqueFiles;
      });
      setUrlInput('');

    } catch (err) {
      console.error("Full error object during Tavily crawl:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred while crawling URL content with Tavily.");
      }
    } finally {
      setIsCrawlingUrl(false);
    }
  }, [urlInput, tavilyApiKey, crawlLimit]);


  const hasSelectedFiles = filesData.some(file => file.selected);
  const selectedFilesCount = filesData.filter(file => file.selected).length;

  let buttonText = 'Download';
  let ariaLabelText = 'Download selected content';
  let loadingText = 'Processing...';

  if (selectedFilesCount > 0) {
    const sfc = selectedFilesCount;
    const formatTextMap: Record<DownloadFormat, string> = {
      pdf: sfc === 1 ? 'PDF' : 'PDFs',
      txt: sfc === 1 ? 'TXT' : 'TXTs',
      both: sfc === 1 ? 'PDF & TXT' : (sfc > 1 ? 'PDFs & TXTs' : 'PDF & TXT'), // handles "PDF & TXT" for single file case more explicitly
    };
     const formatLoadingTextMap: Record<DownloadFormat, string> = {
      pdf: sfc === 1 ? 'Generating PDF...' : 'Generating PDFs...',
      txt: sfc === 1 ? 'Preparing TXT...' : 'Preparing TXTs...',
      both: sfc === 1 ? 'Preparing files...' : 'Preparing files...',
    };

    buttonText = `Download ${formatTextMap[downloadFormat]}`;
    ariaLabelText = `Download selected file(s) as ${formatTextMap[downloadFormat].toLowerCase()}`;
    loadingText = formatLoadingTextMap[downloadFormat];

    const canBeZipped = (sfc > 1) || (sfc === 1 && downloadFormat === 'both');

    if (zipMultipleFiles && canBeZipped) {
      buttonText += ' (ZIP)';
      ariaLabelText += ' in a ZIP archive';
      loadingText = `Generating ZIP...`;
    }
  } else {
    buttonText = 'Select files to download';
    ariaLabelText = 'Select files from the list to download';
  }


  const showZipToggle = ((selectedFilesCount > 1) || (selectedFilesCount === 1 && downloadFormat === 'both')) && hasSelectedFiles;


  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black">
      <div className="bg-neutral-900 shadow-2xl rounded-xl p-6 md:p-10 w-full max-w-2xl transform transition-all duration-500 hover:scale-[1.02]">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <SparklesIcon className="w-10 h-10 text-neutral-400 mr-2" />
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              Krwlr
            </h1>
          </div>
          <p className="text-neutral-400 text-sm md:text-base">
            Upload .txt files or crawl webpages (via Tavily API) to convert/download text content.
          </p>
        </header>

        <main>
          {/* Tavily API Key Input */}
          <div className="mb-6">
            <label htmlFor="tavily-api-key" className="block text-sm font-medium text-neutral-300 mb-1">
              Tavily API Key:
            </label>
            <div className="flex items-center">
              <KeyIcon className="w-5 h-5 text-neutral-400 mr-2 flex-shrink-0" />
              <input
                type="password"
                id="tavily-api-key"
                value={tavilyApiKey}
                onChange={(e) => handleTavilyApiKeyChange(e.target.value)}
                placeholder="Enter your Tavily API Key"
                className="flex-grow p-2.5 bg-neutral-800 border border-neutral-700 rounded-md shadow-sm focus:ring-neutral-500 focus:border-neutral-500 text-white placeholder-neutral-500 sm:text-sm"
                aria-label="Tavily API Key"
                disabled={isLoading || isReadingFiles || isCrawlingUrl}
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Required for crawling URL content. Your key is stored in browser localStorage.
            </p>
          </div>

          {/* URL Crawl Section */}
          <div className="mb-2">
            <label htmlFor="url-input" className="block text-sm font-medium text-neutral-300 mb-1">
              Crawl URL (using Tavily):
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="url"
                id="url-input"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); if (error) setError(null);}}
                placeholder="https://example.com/article"
                className="flex-grow p-2.5 bg-neutral-800 border border-neutral-700 rounded-md shadow-sm focus:ring-neutral-500 focus:border-neutral-500 text-white placeholder-neutral-500 sm:text-sm"
                aria-label="Enter URL to crawl for text content via Tavily API"
                disabled={isLoading || isReadingFiles || isCrawlingUrl}
              />
              <Button
                onClick={handleCrawlUrlContent}
                className="bg-neutral-700 hover:bg-neutral-600 focus:ring-neutral-500 text-white px-4 py-2.5 h-[44px]"
                aria-label="Crawl text from entered URL using Tavily API and add to list"
                isLoading={isCrawlingUrl}
                disabled={isLoading || isReadingFiles || isCrawlingUrl || !urlInput.trim() || !tavilyApiKey.trim() || crawlLimit < 1}
              >
                <GlobeAltIcon className="w-5 h-5 mr-2 sm:mr-0 md:mr-2" />
                <span className="hidden sm:inline md:inline">Crawl & Add</span>
              </Button>
            </div>
          </div>
          <div className="mb-6">
            <label htmlFor="crawl-limit" className="block text-sm font-medium text-neutral-300 mb-1">
              Crawl Limit (pages):
            </label>
            <input
              type="number"
              id="crawl-limit"
              value={crawlLimit}
              onChange={(e) => {
                const limit = parseInt(e.target.value, 10);
                setCrawlLimit(isNaN(limit) ? 0 : limit);
                if (error) setError(null);
              }}
              min="1"
              placeholder="e.g., 50"
              className="w-full p-2.5 bg-neutral-800 border border-neutral-700 rounded-md shadow-sm focus:ring-neutral-500 focus:border-neutral-500 text-white placeholder-neutral-500 sm:text-sm"
              aria-label="Maximum number of pages for Tavily to crawl"
              disabled={isLoading || isReadingFiles || isCrawlingUrl}
            />
             {crawlLimit < 1 && <p className="mt-1 text-xs text-red-400">Limit must be 1 or greater.</p>}
          </div>


          {/* Separator */}
          <div className="flex items-center my-6">
            <hr className="flex-grow border-neutral-700" />
            <span className="px-3 text-neutral-400 text-sm">OR</span>
            <hr className="flex-grow border-neutral-700" />
          </div>

          {/* File Input Section */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFilesUpload}
            className="hidden"
            aria-hidden="true"
            multiple
            accept=".txt"
          />
          <Button
            onClick={triggerFileInput}
            className="w-full mb-6 bg-neutral-700 hover:bg-neutral-600 focus:ring-neutral-500 text-white"
            aria-label="Upload .txt file(s) from your computer"
            isLoading={isReadingFiles}
            disabled={isReadingFiles || isLoading || isCrawlingUrl}
          >
            <FolderOpenIcon className="w-5 h-5 mr-2" />
            {isReadingFiles ? 'Reading Files...' : 'Upload .txt File(s)'}
          </Button>

          {filesData.length > 0 && (
            <div className="mb-6 bg-neutral-800/80 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-700">
                <h2 className="text-lg font-semibold text-white">Files for Download</h2>
                <label htmlFor="select-all" className="flex items-center text-sm text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="select-all"
                    checked={selectAll && filesData.length > 0}
                    onChange={handleSelectAllChange}
                    className="w-4 h-4 text-white bg-neutral-700 border-neutral-600 rounded focus:ring-neutral-500 focus:ring-offset-neutral-900 mr-2"
                    disabled={filesData.length === 0}
                    aria-labelledby="select-all-label"
                  />
                  <span id="select-all-label">Select All ({selectedFilesCount}/{filesData.length})</span>
                </label>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {filesData.map(file => (
                  <div
                    key={file.id}
                    className={`flex items-center p-2.5 rounded-md transition-colors duration-150 ${file.selected ? 'bg-neutral-700' : 'bg-neutral-800 hover:bg-neutral-700/70'}`}
                  >
                    <input
                      type="checkbox"
                      id={`checkbox-${file.id}`}
                      checked={file.selected}
                      onChange={() => handleFileSelectionChange(file.id)}
                      className="w-5 h-5 text-white bg-neutral-700 border-neutral-600 rounded focus:ring-neutral-500 focus:ring-offset-neutral-900 mr-3 flex-shrink-0"
                      aria-labelledby={`filename-${file.id}`}
                    />
                    <DocumentTextIcon className="w-5 h-5 mr-2 text-neutral-400 flex-shrink-0" />
                    <label htmlFor={`checkbox-${file.id}`} id={`filename-${file.id}`} className="text-sm text-neutral-200 truncate cursor-pointer flex-grow" title={file.name}>
                      {file.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 text-red-400 border border-red-700/50 rounded-md text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Download Format Selection */}
          {hasSelectedFiles && (
            <div className="my-6">
              <fieldset role="radiogroup" aria-labelledby="download-format-legend">
                <legend id="download-format-legend" className="block text-sm font-medium text-neutral-300 mb-2">
                  Download format:
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['pdf', 'txt', 'both'] as const).map((format) => (
                    <label
                      key={format}
                      htmlFor={`format-${format}`}
                      className={`flex items-center justify-center text-sm text-neutral-300 cursor-pointer select-none p-2.5 rounded-md border transition-colors duration-150 
                        ${downloadFormat === format ? 'bg-neutral-600 border-neutral-500' : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700/70'}
                        ${(isLoading || isReadingFiles || isCrawlingUrl || !hasSelectedFiles) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="radio"
                        id={`format-${format}`}
                        name="downloadFormat"
                        value={format}
                        checked={downloadFormat === format}
                        onChange={() => { setDownloadFormat(format); if(error) setError(null); }}
                        className="sr-only" // Visually hidden, label provides click area
                        disabled={isLoading || isReadingFiles || isCrawlingUrl || !hasSelectedFiles}
                        aria-label={format === 'both' ? 'PDF and TXT' : format.toUpperCase()}
                      />
                      <span className="capitalize">{format === 'both' ? 'PDF & TXT' : format.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {/* Zip Toggle */}
          {showZipToggle && (
            <div className="my-4 flex items-center justify-center">
              <label htmlFor="zip-toggle" className="flex items-center text-sm text-neutral-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="zip-toggle"
                  checked={zipMultipleFiles}
                  onChange={() => setZipMultipleFiles(prev => !prev)}
                  className="w-4 h-4 text-white bg-neutral-700 border-neutral-600 rounded focus:ring-neutral-500 focus:ring-offset-neutral-900 mr-2"
                  aria-describedby="zip-toggle-description"
                  disabled={isLoading || isReadingFiles || isCrawlingUrl}
                />
                <span id="zip-toggle-description">Compress into a single .zip file</span>
              </label>
            </div>
          )}
          
          <Button
            onClick={generateAndDownload}
            disabled={isLoading || isReadingFiles || isCrawlingUrl || !hasSelectedFiles}
            isLoading={isLoading}
            className="w-full bg-white text-black hover:bg-neutral-200 focus:ring-neutral-300 disabled:opacity-60"
            aria-label={ariaLabelText}
          >
            <DownloadIcon className="w-5 h-5 mr-2" />
            {isLoading ? loadingText : buttonText}
          </Button>
        </main>
      </div>
      <footer className="mt-8 text-center text-neutral-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Krwlr. Enhanced by user feedback.</p>
      </footer>
    </div>
  );
};

export default App;
