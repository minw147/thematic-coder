/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import { useState, useMemo, ChangeEvent, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Type definitions for our data structures
type Theme = {
  name: string;
  description: string;
};

type Codebooks = { [name: string]: Theme[] };

type CodingResult = {
  originalResponse: string;
  themeName: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  confidenceScore: number;
  reasoning: string;
};

type Page = 'codebook' | 'analysis' | 'report';

type ChatMessage = {
    role: 'user' | 'model';
    text: string;
}

// =================================================================
// Reusable Editable Cell Component for the results table
// =================================================================
type EditableCellProps = {
    value: string;
    options: string[];
    onUpdate: (newValue: string) => void;
};

function EditableCell({ value, options, onUpdate }: EditableCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const selectRef = useRef<HTMLSelectElement>(null);

    const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
        onUpdate(e.target.value);
        setIsEditing(false);
    };

    useEffect(() => {
        if (isEditing) {
            selectRef.current?.focus();
        }
    }, [isEditing]);
    
    if (isEditing) {
        return (
            <td className="editable-cell editing">
                <select
                    ref={selectRef}
                    value={value}
                    onChange={handleSelectChange}
                    onBlur={() => setIsEditing(false)}
                >
                    {options.map(option => (
                        <option key={option} value={option}>{option}</option>
                    ))}
                </select>
            </td>
        );
    }

    return (
        <td onClick={() => setIsEditing(true)} className="editable-cell">
            {value}
        </td>
    );
}

// =================================================================
// Sentiment Cell Component
// =================================================================
type SentimentCellProps = {
    value: 'Positive' | 'Negative' | 'Neutral';
    onUpdate: (newValue: string) => void;
};

function SentimentCell({ value, onUpdate }: SentimentCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const selectRef = useRef<HTMLSelectElement>(null);

    const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
        onUpdate(e.target.value);
        setIsEditing(false);
    };

    useEffect(() => {
        if (isEditing) {
            selectRef.current?.focus();
        }
    }, [isEditing]);
    
    const sentimentClass = `sentiment-bubble sentiment-${value.toLowerCase()}`;

    if (isEditing) {
        return (
            <td className="editable-cell editing">
                <select
                    ref={selectRef}
                    value={value}
                    onChange={handleSelectChange}
                    onBlur={() => setIsEditing(false)}
                >
                    {['Positive', 'Negative', 'Neutral'].map(option => (
                        <option key={option} value={option}>{option}</option>
                    ))}
                </select>
            </td>
        );
    }

    return (
        <td onClick={() => setIsEditing(true)} className="editable-cell">
            <div className={sentimentClass}>{value}</div>
        </td>
    );
}


// =================================================================
// Codebook Page Component
// =================================================================
type CodebookPageProps = {
  themes: Theme[];
  setThemes: (newThemes: Theme[] | ((prevThemes: Theme[]) => Theme[])) => void;
  codebooks: Codebooks;
  setCodebooks: React.Dispatch<React.SetStateAction<Codebooks>>;
  activeCodebook: string;
  setActiveCodebook: React.Dispatch<React.SetStateAction<string>>;
}

function CodebookPage({ themes, setThemes, codebooks, setCodebooks, activeCodebook, setActiveCodebook }: CodebookPageProps) {
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeDescription, setNewThemeDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newCodebookName, setNewCodebookName] = useState('');

  const handleCreateCodebook = () => {
    const trimmedName = newCodebookName.trim();
    if (trimmedName && !codebooks[trimmedName]) {
        setCodebooks(prev => ({ ...prev, [trimmedName]: [] }));
        setActiveCodebook(trimmedName);
        setNewCodebookName('');
    }
  };

  const handleAddTheme = () => {
    if (newThemeName.trim() && newThemeDescription.trim()) {
      if (themes.some(theme => theme.name.toLowerCase() === newThemeName.trim().toLowerCase())) {
        setError(`Theme "${newThemeName}" already exists.`);
        return;
      }
      setError(null);
      setThemes(prev => [...prev, { name: newThemeName.trim(), description: newThemeDescription.trim() }]);
      setNewThemeName('');
      setNewThemeDescription('');
    }
  };

  const handleRemoveTheme = (index: number) => {
    setThemes(themes.filter((_, i) => i !== index));
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const newThemes: Theme[] = text.split('\n')
          .map(line => line.trim())
          .filter(line => line.includes(','))
          .map(line => {
            const parts = line.split(',');
            const name = parts.shift()?.trim() || '';
            const description = parts.join(',').trim() || '';
            return { name, description };
          })
          .filter(theme => theme.name && theme.description);
        
        setThemes(prevThemes => {
            const uniqueNewThemes = newThemes.filter(newTheme => 
              !prevThemes.some(existingTheme => existingTheme.name.toLowerCase() === newTheme.name.toLowerCase())
            );
            return [...prevThemes, ...uniqueNewThemes];
        });
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Error parsing CSV file. Please ensure it is formatted correctly.\nDetails: ${errorMessage}`);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
  };


  return (
    <div className="page-content">
       <div className="left-panel">
         <div className="panel" role="form" aria-labelledby="codebook-management-heading">
            <h2 id="codebook-management-heading">Manage Codebooks</h2>
             <div className="codebook-management-controls">
                <div className="form-group">
                    <label htmlFor="codebook-select">Select Codebook</label>
                    <select id="codebook-select" value={activeCodebook} onChange={(e) => setActiveCodebook(e.target.value)}>
                        <option value="" disabled>-- Select a codebook --</option>
                        {Object.keys(codebooks).sort().map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="new-codebook-name">Or Create New Codebook</label>
                    <div className="input-group">
                        <input 
                            id="new-codebook-name" 
                            type="text" 
                            value={newCodebookName} 
                            onChange={(e) => setNewCodebookName(e.target.value)}
                            placeholder="New Codebook Name"
                        />
                        <button className="button" onClick={handleCreateCodebook} disabled={!newCodebookName.trim() || !!codebooks[newCodebookName.trim()]}>Create</button>
                    </div>
                </div>
            </div>
         </div>

         {activeCodebook && (
         <div className="panel" role="form" aria-labelledby="codebook-heading">
            <h2 id="codebook-heading">Edit "{activeCodebook}"</h2>
            <div className="form-group">
                <label htmlFor="theme-name">Theme Name</label>
                <input
                    id="theme-name"
                    type="text"
                    value={newThemeName}
                    onChange={(e) => setNewThemeName(e.target.value)}
                    placeholder="e.g., Customer Support"
                />
            </div>
             <div className="form-group">
                <label htmlFor="theme-description">Theme Description</label>
                <textarea
                    id="theme-description"
                    value={newThemeDescription}
                    onChange={(e) => setNewThemeDescription(e.target.value)}
                    placeholder="e.g., Mentions of interacting with the support team."
                />
            </div>
            <button onClick={handleAddTheme} className="button">Add Theme</button>
            {error && <div className="error" style={{marginTop: '1rem'}}>{error}</div>}

            <div className="bulk-upload-section">
                <h3>Bulk Upload</h3>
                <p>Upload a CSV file with two columns: theme name, theme description (no header row).</p>
                <label htmlFor="csv-upload" className="button">Upload CSV</label>
                <input id="csv-upload" type="file" accept=".csv" onChange={handleFileUpload} />
            </div>
          </div>
         )}
       </div>
       <div className="right-panel panel">
          <h2>Current Codebook: {activeCodebook || "None selected"}</h2>
          {activeCodebook && themes.length > 0 ? (
                <ul className="theme-list" aria-live="polite">
                    {themes.map((theme, index) => (
                        <li key={index} className="theme-item">
                           <div className="theme-item-content">
                             <strong>{theme.name}</strong>
                             <p>{theme.description}</p>
                           </div>
                           <button onClick={() => handleRemoveTheme(index)} className="remove-button" aria-label={`Remove ${theme.name} theme`}>&times;</button>
                        </li>
                    ))}
                </ul>
            ) : (
              <div className="results-placeholder">
                <p>{activeCodebook ? "Add themes manually or upload a CSV to build this codebook." : "Select a codebook to view its themes, or create a new one."}</p>
              </div>
            )}
       </div>
    </div>
  );
}


// =================================================================
// Analysis Page Component
// =================================================================
type AnalysisPageProps = {
  themes: Theme[];
  results: CodingResult[];
  setResults: React.Dispatch<React.SetStateAction<CodingResult[]>>;
  ai: GoogleGenAI;
}

function AnalysisPage({ themes, results, setResults, ai }: AnalysisPageProps) {
  const [responses, setResponses] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState(false);
  const LOW_CONFIDENCE_THRESHOLD = 0.7;

  const filteredResults = useMemo(() => {
      if (!showLowConfidenceOnly) {
          return results;
      }
      return results.filter(r => r.confidenceScore < LOW_CONFIDENCE_THRESHOLD);
  }, [results, showLowConfidenceOnly]);

  const handleResponseFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target?.result as string;
        setResponses(prev => `${prev}\n${text}`.trim());
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  
  const handleUpdateResult = (indexToUpdate: number, field: 'themeName' | 'sentiment', value: string) => {
      const originalIndex = results.findIndex(res => res.originalResponse === filteredResults[indexToUpdate].originalResponse);
      const updatedResults = [...results];
      updatedResults[originalIndex] = { ...updatedResults[originalIndex], [field]: value };
      setResults(updatedResults);
  };

  const handleCodeResponses = async () => {
    if (themes.length === 0 || !responses.trim()) {
      setError('Please define a codebook and provide some responses to code.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);

    const systemInstruction = `You are an expert qualitative data analyst. Your task is to categorize user-provided text responses into a set of predefined themes.
- Analyze each response carefully.
- Assign the single most appropriate theme from the provided list.
- Determine the sentiment of the response (Positive, Negative, or Neutral).
- Provide a confidence score from 0.0 (not confident at all) to 1.0 (completely confident).
- Provide a brief reasoning for your choice.
- Only use the themes provided. Do not create new themes. If no theme fits, assign "Uncategorized".`;

    const themeDefinitions = themes.map(t => `- ${t.name}: ${t.description}`).join('\n');
    const responseList = responses.trim().split('\n');

    const prompt = `Here is the codebook (themes):\n${themeDefinitions}\n\nPlease code the following responses:\n${responseList.map(r => `- "${r}"`).join('\n')}`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        results: {
          type: Type.ARRAY,
          description: 'An array of coding results, one for each user response.',
          items: {
            type: Type.OBJECT,
            properties: {
              originalResponse: { type: Type.STRING, description: 'The original response text from the user.' },
              themeName: { type: Type.STRING, description: 'The name of the theme assigned to the response.' },
              sentiment: { type: Type.STRING, description: 'The sentiment of the response (Positive, Negative, or Neutral).'},
              confidenceScore: { type: Type.NUMBER, description: 'A score between 0.0 and 1.0 indicating confidence.' },
              reasoning: { type: Type.STRING, description: 'A brief justification for the assigned theme.' },
            },
            required: ['originalResponse', 'themeName', 'sentiment', 'confidenceScore', 'reasoning'],
          },
        },
      },
      required: ['results'],
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction, responseMimeType: 'application/json', responseSchema: responseSchema },
      });

      const parsedResponse = JSON.parse(response.text);
      setResults(parsedResponse.results);

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`An error occurred while communicating with the API. Please try again.\nDetails: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const getConfidenceColor = (score: number) => {
    if (score > 0.8) return '#4caf50'; // Green
    if (score > 0.5) return '#ffc107'; // Yellow
    return '#f44336'; // Red
  };

  const handleDownloadCSV = () => {
    if (results.length === 0) return;

    const headers = ["Response", "Assigned Theme", "Sentiment", "Confidence Score", "Reasoning"];
    
    const escapeCsvField = (field: string | number): string => {
        const stringField = String(field);
        if (/[",\n]/.test(stringField)) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
    };

    const csvContent = [
        headers.join(','),
        ...results.map(row => [
            escapeCsvField(row.originalResponse),
            escapeCsvField(row.themeName),
            escapeCsvField(row.sentiment),
            escapeCsvField(row.confidenceScore),
            escapeCsvField(row.reasoning)
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "coded_responses.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-content-vertical">
        <div className="panel" role="form" aria-labelledby="responses-heading">
            <h2 id="responses-heading">Add Responses for Analysis</h2>
            <div className="analysis-input-layout">
                <div className="form-group">
                    <label htmlFor="responses-textarea">Paste your responses here, one per line.</label>
                    <textarea
                        id="responses-textarea"
                        value={responses}
                        onChange={(e) => setResponses(e.target.value)}
                        placeholder="The support team was very helpful.&#10;The app is too slow.&#10;I wish there was a dark mode feature."
                        style={{minHeight: '200px'}}
                    />
                </div>
                <div className="bulk-upload-section analysis-upload">
                    <h3>Or Upload Data</h3>
                    <p>Upload a single-column CSV file with responses (no header row).</p>
                    <label htmlFor="csv-response-upload" className="button">Upload CSV</label>
                    <input id="csv-response-upload" type="file" accept=".csv" onChange={handleResponseFileUpload} />
                </div>
            </div>
            <button onClick={handleCodeResponses} disabled={isLoading || themes.length === 0 || !responses.trim()} className="button">
                {isLoading ? 'Coding...' : 'Code Responses'}
            </button>
        </div>
        <div className="panel" role="region" aria-live="polite">
            <div className="results-header">
                <h2>Review Results</h2>
                <div className="controls-group">
                    <div className="filter-controls">
                        <label>
                            <input type="checkbox" checked={showLowConfidenceOnly} onChange={(e) => setShowLowConfidenceOnly(e.target.checked)} />
                            Show low confidence only (&lt;{LOW_CONFIDENCE_THRESHOLD * 100}%)
                        </label>
                    </div>
                    <button onClick={handleDownloadCSV} disabled={results.length === 0} className="button small-button">
                        Download CSV
                    </button>
                </div>
            </div>
            
            {isLoading && (
                <div className="loading">
                    <div className="loading-spinner"></div>
                    <p>AI is analyzing your data...</p>
                </div>
            )}
            {error && <div className="error"><p><strong>Error</strong></p>{error}</div>}
            {!isLoading && !error && results.length === 0 && (
                <div className="results-placeholder">
                    <p>Your coded responses will appear here.</p>
                </div>
            )}
            {!isLoading && results.length > 0 && (
                <div className="table-wrapper">
                    <table className="results-table">
                        <thead>
                            <tr>
                                <th>Response</th>
                                <th>Assigned Theme</th>
                                <th>Sentiment</th>
                                <th>Confidence</th>
                                <th>Reasoning</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredResults.map((result, index) => (
                                <tr key={index}>
                                    <td>{result.originalResponse}</td>
                                    <EditableCell
                                        value={result.themeName}
                                        options={themes.map(t => t.name).concat(['Uncategorized'])}
                                        onUpdate={(newValue) => handleUpdateResult(index, 'themeName', newValue)}
                                    />
                                    <SentimentCell
                                        value={result.sentiment}
                                        onUpdate={(newValue) => handleUpdateResult(index, 'sentiment', newValue as 'Positive' | 'Negative' | 'Neutral')}
                                    />
                                    <td className="confidence-cell" style={{ color: getConfidenceColor(result.confidenceScore) }}>
                                        {(result.confidenceScore * 100).toFixed(0)}%
                                    </td>
                                    <td>{result.reasoning}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    </div>
  );
}


// =================================================================
// Bar Chart Component
// =================================================================
type BarChartProps = {
    title: string;
    data: Map<string, number>;
}
function BarChartComponent({ title, data }: BarChartProps) {
    const maxCount = useMemo(() => Math.max(1, ...Array.from(data.values())), [data]);
    return (
        <div className="chart-container">
            <h3>{title}</h3>
            {data.size > 0 ? (
                <div className="bar-chart">
                    {Array.from(data.entries()).map(([theme, count]) => (
                        <div key={theme} className="bar-wrapper" title={`${theme}: ${count}`}>
                            <span className="bar-label-top">{count}</span>
                            <div className="bar" style={{ height: `${(count / maxCount) * 100}%` }}></div>
                            <span className="bar-label-bottom">{theme}</span>
                        </div>
                    ))}
                </div>
            ) : <p className="no-data-message">No data for this category.</p>}
        </div>
    );
}

/**
 * A simple markdown to HTML parser.
 * Handles headings, bold, italic, lists, and paragraphs.
 */
function parseMarkdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  let html = '';
  let inList = false;
  let listType = ''; // 'ul' or 'ol'

  for (const line of lines) {
    // Close list if current line is not a list item
    if (inList && !/^\s*([-*]|\d+\.)\s/.test(line)) {
      html += `</${listType}>\n`;
      inList = false;
    }

    if (line.startsWith('# ')) html += `<h1>${line.substring(2)}</h1>`;
    else if (line.startsWith('## ')) html += `<h2>${line.substring(3)}</h2>`;
    else if (line.startsWith('### ')) html += `<h3>${line.substring(4)}</h3>`;
    else if (line.startsWith('---')) html += '<hr />';
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList || listType !== 'ul') {
        html += '<ul>\n';
        inList = true;
        listType = 'ul';
      }
      html += `<li>${line.substring(2)}</li>\n`;
    } else if (/^\d+\.\s/.test(line)) {
        if (!inList || listType !== 'ol') {
            html += '<ol>\n';
            inList = true;
            listType = 'ol';
        }
        html += `<li>${line.replace(/^\d+\.\s/, '')}</li>\n`;
    } else if (line.trim() !== '') {
        html += `<p>${line}</p>\n`;
    }
  }

  if (inList) {
    html += `</${listType}>\n`;
  }

  // Handle inline elements
  return html
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>');
}


// =================================================================
// Report Page Component
// =================================================================
type ReportPageProps = {
  results: CodingResult[];
  ai: GoogleGenAI;
}

function ReportPage({ results, ai }: ReportPageProps) {
    const [reportPrompt, setReportPrompt] = useState(
        `Generate a summary report based on the provided thematic analysis data. Include the following sections:\n1.  **Executive Summary:** A brief overview of the key findings.\n2.  **Theme Breakdown:** Detail each theme, its frequency, and include 2-3 illustrative quotes from the original responses.\n3.  **Key Insights & Recommendations:** Conclude with actionable insights derived from the analysis.`
    );
    const [reportContent, setReportContent] = useState('');
    const [isReportLoading, setIsReportLoading] = useState(false);
    const [reportError, setReportError] = useState<string | null>(null);

    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatHistoryRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const themeCounts = useMemo(() => {
        const positive = new Map<string, number>();
        const negative = new Map<string, number>();
        const neutral = new Map<string, number>();
        
        results.forEach(result => {
            const theme = result.themeName;
            if (result.sentiment === 'Positive') {
                positive.set(theme, (positive.get(theme) || 0) + 1);
            } else if (result.sentiment === 'Negative') {
                negative.set(theme, (negative.get(theme) || 0) + 1);
            } else if (result.sentiment === 'Neutral') {
                neutral.set(theme, (neutral.get(theme) || 0) + 1);
            }
        });
        return { positive, negative, neutral };
    }, [results]);


    const handleGenerateReport = async () => {
        setIsReportLoading(true);
        setReportError(null);
        setReportContent('');

        const context = JSON.stringify(results, null, 2);
        const prompt = `Here is the thematic analysis data:\n\n${context}\n\nBased on that data, please fulfill the following request:\n\n${reportPrompt}`;
        const systemInstruction = 'You are an expert report writer specializing in qualitative data analysis. Write a comprehensive, well-structured report in Markdown format based on the user\'s prompt and the provided JSON data of coded survey responses. Use headings, lists, and bold text to format the report clearly.';
        
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { systemInstruction } });
            setReportContent(response.text);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setReportError(`An error occurred while generating the report. Details: ${errorMessage}`);
        } finally {
            setIsReportLoading(false);
        }
    };

    const handleViewAsHtml = () => {
        if (!reportContent) return;
        const html = parseMarkdownToHtml(reportContent);
        const htmlDoc = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Report Preview</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 2rem auto; padding: 2rem; border: 1px solid #ddd; border-radius: 8px; }
                    h1, h2, h3 { color: #111; }
                    hr { border: 0; border-top: 1px solid #eee; margin: 1em 0; }
                    ul, ol { padding-left: 20px; }
                    strong { font-weight: 600; }
                    p { margin: 0 0 1em; }
                    li { margin-bottom: 0.5em; }
                </style>
            </head>
            <body>
                ${html}
            </body>
            </html>
        `;
        const newTab = window.open();
        if (newTab) {
            newTab.document.open();
            newTab.document.write(htmlDoc);
            newTab.document.close();
        }
    };
    
    const handleSendChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || isChatLoading) return;

        const newUserMessage: ChatMessage = { role: 'user', text: chatInput };
        setChatHistory(prev => [...prev, newUserMessage]);
        setChatInput('');
        setIsChatLoading(true);
        
        const context = JSON.stringify(results, null, 2);
        const prompt = `Based on the following coded data:\n\n${context}\n\nPlease answer this question: "${chatInput}"`;
        const systemInstruction = 'You are a helpful data analyst. Answer the user\'s question based ONLY on the provided JSON data of coded survey responses. Be concise and clear.';

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { systemInstruction } });
            const modelMessage: ChatMessage = { role: 'model', text: response.text };
            setChatHistory(prev => [...prev, modelMessage]);
        } catch (e) {
            const errorMessageText = e instanceof Error ? e.message : String(e);
            const errorMessage: ChatMessage = { role: 'model', text: `Sorry, an error occurred. Details: ${errorMessageText}`};
            setChatHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsChatLoading(false);
        }
    }
    
    const handleAddToReport = (text: string) => {
        setReportContent(prev => `${prev}\n\n---\n\n${text}`);
    }
    
    return (
        <div className="page-content-vertical">
            <div className="panel data-visualization">
                <h2>Theme Sentiment Analysis</h2>
                <div className="charts-wrapper">
                    <BarChartComponent title="Positive Themes" data={themeCounts.positive} />
                    <BarChartComponent title="Negative Themes" data={themeCounts.negative} />
                    <BarChartComponent title="Neutral Themes" data={themeCounts.neutral} />
                </div>
            </div>
            <div className="report-page-layout">
                {/* Left Panel: Chat */}
                <div className="panel chat-panel">
                    <h2>Chat with your Data</h2>
                    <div className="chat-history" ref={chatHistoryRef}>
                        {chatHistory.map((msg, index) => (
                            <div key={index} className={`chat-message ${msg.role}-message`}>
                                {msg.text}
                                {msg.role === 'model' && (
                                     <button onClick={() => handleAddToReport(msg.text)} className="add-to-report-btn" title="Add to Report">+</button>
                                )}
                            </div>
                        ))}
                         {isChatLoading && (
                            <div className="chat-message model-message">
                                <div className="loading-dots">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}
                    </div>
                    <form onSubmit={handleSendChat} className="chat-input-form">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Ask a question about your data..."
                            disabled={isChatLoading}
                        />
                        <button type="submit" disabled={isChatLoading || !chatInput.trim()}>Send</button>
                    </form>
                </div>

                {/* Right Panel: Report Editor */}
                <div className="panel report-panel">
                    <h2>Report Editor</h2>
                    <div className="form-group">
                        <label htmlFor="report-prompt">Report Generation Prompt</label>
                        <textarea
                            id="report-prompt"
                            value={reportPrompt}
                            onChange={(e) => setReportPrompt(e.target.value)}
                            style={{ minHeight: '120px' }}
                        />
                    </div>
                    <div className="report-actions">
                        <button onClick={handleGenerateReport} disabled={isReportLoading || results.length === 0} className="button">
                            {isReportLoading ? 'Generating...' : 'Generate Report'}
                        </button>
                    </div>
                    {reportError && <div className="error" style={{marginTop: '1rem'}}>{reportError}</div>}
                    
                    <div className="form-group" style={{marginTop: '1.5rem'}}>
                         <div className="label-with-action">
                            <label htmlFor="report-content">Report Content (Markdown)</label>
                            <button onClick={handleViewAsHtml} disabled={!reportContent} className="button small-button secondary-button">
                                View as HTML
                            </button>
                         </div>
                         {isReportLoading && (
                            <div className="loading" style={{height: '200px'}}>
                                <div className="loading-spinner"></div>
                            </div>
                         )}
                         {!isReportLoading && (
                            <textarea
                                id="report-content"
                                value={reportContent}
                                onChange={(e) => setReportContent(e.target.value)}
                                placeholder="Your generated report will appear here. You can also edit it directly."
                                style={{ minHeight: '400px', fontFamily: 'monospace' }}
                            />
                         )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// Main App Component
// =================================================================
function App() {
  const [currentPage, setCurrentPage] = useState<Page>('codebook');
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('thematicCoder-theme');
    return (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('thematicCoder-theme', theme);
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const [codebooks, setCodebooks] = useState<Codebooks>(() => {
    try {
      const savedCodebooks = localStorage.getItem('thematicCoder-codebooks');
      return savedCodebooks ? JSON.parse(savedCodebooks) : {};
    } catch (error) {
      console.error("Error loading codebooks from localStorage", error);
      return {};
    }
  });

  const [activeCodebook, setActiveCodebook] = useState<string>(() => {
    const savedActive = localStorage.getItem('thematicCoder-activeCodebook');
    const savedCodebooks = localStorage.getItem('thematicCoder-codebooks');
    const parsedCodebooks = savedCodebooks ? JSON.parse(savedCodebooks) : {};
    if (savedActive && parsedCodebooks[savedActive]) {
        return savedActive;
    }
    return Object.keys(parsedCodebooks).sort()[0] || '';
  });

  const [results, setResults] = useState<CodingResult[]>([]);
  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);
  
  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem('thematicCoder-codebooks', JSON.stringify(codebooks));
      localStorage.setItem('thematicCoder-activeCodebook', activeCodebook);
    } catch (error) {
      console.error("Error saving to localStorage", error);
    }
  }, [codebooks, activeCodebook]);

  const activeThemes = codebooks[activeCodebook] || [];

  const handleSetThemes = (newThemes: Theme[] | ((prevThemes: Theme[]) => Theme[])) => {
    if (!activeCodebook) return;
    setCodebooks(prevCodebooks => {
        const currentThemes = prevCodebooks[activeCodebook] || [];
        const updatedThemes = typeof newThemes === 'function' ? newThemes(currentThemes) : newThemes;
        return {
            ...prevCodebooks,
            [activeCodebook]: updatedThemes,
        };
    });
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'codebook':
        return <CodebookPage 
                  codebooks={codebooks} 
                  setCodebooks={setCodebooks}
                  activeCodebook={activeCodebook}
                  setActiveCodebook={setActiveCodebook}
                  themes={activeThemes}
                  setThemes={handleSetThemes}
               />;
      case 'analysis':
        return <AnalysisPage themes={activeThemes} results={results} setResults={setResults} ai={ai} />;
      case 'report':
        return <ReportPage results={results} ai={ai} />;
      default:
        return <CodebookPage 
                  codebooks={codebooks} 
                  setCodebooks={setCodebooks}
                  activeCodebook={activeCodebook}
                  setActiveCodebook={setActiveCodebook}
                  themes={activeThemes}
                  setThemes={handleSetThemes}
               />;
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Thematic Coder AI</h1>
        <button onClick={handleThemeToggle} className="theme-switcher" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>
      <nav className="main-nav">
        <button onClick={() => setCurrentPage('codebook')} className={currentPage === 'codebook' ? 'active' : ''}>
          1. Codebook
        </button>
        <button onClick={() => setCurrentPage('analysis')} className={currentPage === 'analysis' ? 'active' : ''} disabled={activeThemes.length === 0}>
          2. Analysis
        </button>
        <button onClick={() => setCurrentPage('report')} className={currentPage === 'report' ? 'active' : ''} disabled={results.length === 0}>
          3. Report
        </button>
      </nav>
      <main>
        {renderPage()}
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);