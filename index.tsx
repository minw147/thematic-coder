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
  themeName: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  confidenceScore: number;
  reasoning: string;
  responseColumn: string;
  suggestedTheme?: {
    name: string;
    description: string;
  };
  rawData: { [key: string]: string };
};

type Page = 'codebook' | 'analysis' | 'report';

type ChatMessage = {
    role: 'user' | 'model';
    text: string;
}

// =================================================================
// API Key Modal Component
// =================================================================
type ApiKeyModalProps = {
    isOpen: boolean;
    onClose: () => void;
    apiKey: string | null;
    setApiKey: (key: string | null) => void;
};

function ApiKeyModal({ isOpen, onClose, apiKey, setApiKey }: ApiKeyModalProps) {
    const [inputKey, setInputKey] = useState('');

    const handleSave = () => {
        if (inputKey.trim()) {
            setApiKey(inputKey.trim());
            setInputKey('');
            onClose();
        }
    };
    
    const handleClear = () => {
        setApiKey(null);
        setInputKey('');
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                 <div className="modal-header">
                    <h2>Gemini API Key</h2>
                    <button onClick={onClose} className="modal-close-button" aria-label="Close API Key settings">&times;</button>
                </div>
                <div className="api-key-content">
                    {apiKey ? (
                        <div className="api-key-status">
                            <p>API Key is set. You're ready to analyze.</p>
                            <button onClick={handleClear} className="button small-button secondary-button">Clear Key</button>
                        </div>
                    ) : (
                        <div className="form-group">
                            <label htmlFor="api-key-input">Enter your key to enable AI features.</label>
                            <div className="input-group">
                                <input
                                    id="api-key-input"
                                    type="password"
                                    value={inputKey}
                                    onChange={(e) => setInputKey(e.target.value)}
                                    placeholder="Enter your Gemini API Key"
                                    aria-label="Gemini API Key Input"
                                    autoFocus
                                />
                                <button onClick={handleSave} className="button">Save Key</button>
                            </div>
                            <p className="api-key-info">Your API key is stored only in your browser's local storage.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


// =================================================================
// Analysis Confirmation Modal Component
// =================================================================
type AnalysisConfirmationModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onAppend: () => void;
    onReplace: () => void;
};

function AnalysisConfirmationModal({ isOpen, onClose, onAppend, onReplace }: AnalysisConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                 <div className="modal-header">
                    <h2>Existing Results Found</h2>
                    <button onClick={onClose} className="modal-close-button" aria-label="Close dialog">&times;</button>
                </div>
                <div className="modal-body">
                    <p>You have existing analysis results. How would you like to proceed with the new data?</p>
                    <div className="modal-actions">
                        <button onClick={onAppend} className="button">Append to Results</button>
                        <button onClick={onReplace} className="button secondary-button">Replace Results</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// Theme Suggestion Modal Component
// =================================================================
type SuggestedThemeWithStatus = CodingResult & {
    isApproved: boolean;
    editedName: string;
    editedDescription: string;
};

type ThemeSuggestionModalProps = {
    isOpen: boolean;
    suggestions: CodingResult[];
    onComplete: (processedSuggestions: CodingResult[], newThemes: Theme[]) => void;
    onClose: () => void;
};

function ThemeSuggestionModal({ isOpen, suggestions, onComplete, onClose }: ThemeSuggestionModalProps) {
    const [processedSuggestions, setProcessedSuggestions] = useState<SuggestedThemeWithStatus[]>([]);

    useEffect(() => {
        if (isOpen && suggestions.length > 0) {
            setProcessedSuggestions(suggestions.map(s => ({
                ...s,
                isApproved: true, // Default to approved
                editedName: s.suggestedTheme!.name,
                editedDescription: s.suggestedTheme!.description,
            })));
        }
    }, [isOpen, suggestions]);

    const handleToggleApproval = (index: number) => {
        setProcessedSuggestions(prev => prev.map((s, i) => i === index ? { ...s, isApproved: !s.isApproved } : s));
    };
    
    const handleFieldChange = (index: number, field: 'editedName' | 'editedDescription', value: string) => {
        setProcessedSuggestions(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
    };

    const handleFinish = () => {
        const newThemes: Theme[] = [];
        const finalResults: CodingResult[] = [];

        processedSuggestions.forEach(s => {
            if (s.isApproved && s.editedName.trim() && s.editedDescription.trim()) {
                const newTheme = { name: s.editedName.trim(), description: s.editedDescription.trim() };
                newThemes.push(newTheme);
                // Create a new result object without the suggestion fields
                const { suggestedTheme, isApproved, editedName, editedDescription, ...coreResult } = s;
                finalResults.push({ ...coreResult, themeName: newTheme.name });
            } else {
                const { suggestedTheme, isApproved, editedName, editedDescription, ...coreResult } = s;
                finalResults.push({ ...coreResult, themeName: 'Uncategorized' });
            }
        });
        onComplete(finalResults, newThemes);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content suggestion-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>AI Theme Suggestions</h2>
                    <button onClick={onClose} className="modal-close-button" aria-label="Close dialog">&times;</button>
                </div>
                <div className="modal-body">
                    <p>The AI found some responses that might not fit the current codebook. Review, edit, and approve the themes you want to add.</p>
                    <div className="suggestion-list">
                        {processedSuggestions.map((s, index) => (
                            <div key={index} className={`suggestion-item ${!s.isApproved ? 'is-disabled' : ''}`}>
                                <p>For the response:</p>
                                <blockquote>{s.rawData[s.responseColumn]}</blockquote>
                                <div className="suggestion-controls">
                                    <div className="suggestion-approval">
                                        <input
                                            type="checkbox"
                                            id={`approve-${index}`}
                                            checked={s.isApproved}
                                            onChange={() => handleToggleApproval(index)}
                                            aria-label="Approve suggestion"
                                        />
                                    </div>
                                    <div className="suggestion-inputs">
                                        <div className="form-group">
                                            <label htmlFor={`theme-name-${index}`}>Suggested Theme Name</label>
                                            <input
                                                id={`theme-name-${index}`}
                                                type="text"
                                                value={s.editedName}
                                                onChange={(e) => handleFieldChange(index, 'editedName', e.target.value)}
                                                disabled={!s.isApproved}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor={`theme-desc-${index}`}>Suggested Description</label>
                                            <textarea
                                                id={`theme-desc-${index}`}
                                                value={s.editedDescription}
                                                onChange={(e) => handleFieldChange(index, 'editedDescription', e.target.value)}
                                                disabled={!s.isApproved}
                                                rows={3}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="modal-actions">
                    <button onClick={handleFinish} className="button">Add Approved Themes & Continue</button>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// Delete Confirmation Modal Component
// =================================================================
type DeleteConfirmationModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    codebookName: string;
    hasAnalysisResults: boolean;
};

function DeleteConfirmationModal({ isOpen, onClose, onConfirm, codebookName, hasAnalysisResults }: DeleteConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Confirm Deletion</h2>
                    <button onClick={onClose} className="modal-close-button" aria-label="Close dialog">&times;</button>
                </div>
                <div className="modal-body">
                    <p>Are you sure you want to permanently delete the "<strong>{codebookName}</strong>" codebook?</p>
                    <p>This action cannot be undone.</p>
                    {hasAnalysisResults && (
                        <p className="warning-text">
                            <strong>Warning:</strong> Deleting this codebook will also clear all of your current analysis results.
                        </p>
                    )}
                    <div className="modal-actions">
                        <button onClick={onClose} className="button secondary-button">Cancel</button>
                        <button onClick={onConfirm} className="button danger-button">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// Prompt Suggestion Modal Component
// =================================================================
type PromptSuggestionModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (prompt: string) => void;
    initialPrompt: string;
};

function PromptSuggestionModal({ isOpen, onClose, onSave, initialPrompt }: PromptSuggestionModalProps) {
    const [editedPrompt, setEditedPrompt] = useState('');

    useEffect(() => {
        if (isOpen) {
            setEditedPrompt(initialPrompt);
        }
    }, [isOpen, initialPrompt]);

    const handleSaveClick = () => {
        onSave(editedPrompt);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content prompt-suggestion-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>AI Prompt Suggestion</h2>
                    <button onClick={onClose} className="modal-close-button" aria-label="Close dialog">&times;</button>
                </div>
                <div className="modal-body">
                    <p>The AI has generated a prompt based on your data's metadata. You can edit it below before using it.</p>
                    <div className="form-group">
                        <label htmlFor="suggested-prompt-textarea">Suggested Prompt</label>
                        <textarea
                            id="suggested-prompt-textarea"
                            value={editedPrompt}
                            onChange={(e) => setEditedPrompt(e.target.value)}
                        />
                    </div>
                </div>
                <div className="modal-actions">
                    <button onClick={onClose} className="button secondary-button">Cancel</button>
                    <button onClick={handleSaveClick} className="button">Save Prompt</button>
                </div>
            </div>
        </div>
    );
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
  deleteCodebook: (name: string) => void;
  results: CodingResult[];
}

function CodebookPage({ themes, setThemes, codebooks, setCodebooks, activeCodebook, setActiveCodebook, deleteCodebook, results }: CodebookPageProps) {
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeDescription, setNewThemeDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newCodebookName, setNewCodebookName] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleCreateCodebook = () => {
    const trimmedName = newCodebookName.trim();
    if (trimmedName && !codebooks[trimmedName]) {
        setCodebooks(prev => ({ ...prev, [trimmedName]: [] }));
        setActiveCodebook(trimmedName);
        setNewCodebookName('');
    }
  };

  const handleDeleteSelectedCodebook = () => {
    if (activeCodebook) {
        setIsDeleteModalOpen(true);
    }
  };

  const handleConfirmDelete = () => {
      if (activeCodebook) {
          deleteCodebook(activeCodebook);
      }
      setIsDeleteModalOpen(false);
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

  const handleExportCSV = () => {
    if (!activeCodebook || themes.length === 0) return;

    const escapeCsvField = (field: string): string => {
        const stringField = String(field);
        if (/[",\n]/.test(stringField)) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
    };

    const csvContent = themes
        .map(theme => `${escapeCsvField(theme.name)},${escapeCsvField(theme.description)}`)
        .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeCodebook}-codebook.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  return (
    <>
        <div className="page-content">
           <div className="left-panel">
             <div className="panel" role="form" aria-labelledby="codebook-management-heading">
                <h2 id="codebook-management-heading">Manage Codebooks</h2>
                 <div className="codebook-management-controls">
                    <div className="form-group">
                        <label htmlFor="codebook-select">Select Codebook</label>
                        <div className="input-group">
                            <select id="codebook-select" value={activeCodebook} onChange={(e) => setActiveCodebook(e.target.value)}>
                                <option value="" disabled>-- Select a codebook --</option>
                                {Object.keys(codebooks).sort().map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                            <button 
                                className="button danger-button" 
                                onClick={handleDeleteSelectedCodebook} 
                                disabled={!activeCodebook}
                                title={activeCodebook ? `Delete '${activeCodebook}' codebook` : 'No codebook selected'}
                            >
                                Delete
                            </button>
                        </div>
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
              <div className="panel-title-header">
                <h2>Current Codebook: {activeCodebook || "None selected"}</h2>
                <button
                    onClick={handleExportCSV}
                    disabled={!activeCodebook || themes.length === 0}
                    className="button small-button secondary-button"
                    title={themes.length > 0 ? `Export '${activeCodebook}' as CSV` : 'No themes to export'}
                >
                    Export CSV
                </button>
              </div>
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
        <DeleteConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={handleConfirmDelete}
            codebookName={activeCodebook}
            hasAnalysisResults={results.length > 0}
        />
    </>
  );
}


// =================================================================
// Analysis Page Component
// =================================================================
type AnalysisPageProps = {
  themes: Theme[];
  results: CodingResult[];
  setResults: React.Dispatch<React.SetStateAction<CodingResult[]>>;
  ai: GoogleGenAI | null;
  addNewThemes: (newThemes: Theme[]) => void;
}

function AnalysisPage({ themes, results, setResults, ai, addNewThemes }: AnalysisPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data state
  const [uploadedData, setUploadedData] = useState<{[key: string]: string}[]>([]);
  const [dataHeaders, setDataHeaders] = useState<string[]>([]);
  const [responseColumn, setResponseColumn] = useState<string>('');

  // UI State
  const [showLowConfidenceOnly, setShowLowConfidenceOnly] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  
  // Modals state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);

  // State for theme suggestion workflow
  const [suggestedThemes, setSuggestedThemes] = useState<CodingResult[]>([]);
  const [pendingResults, setPendingResults] = useState<CodingResult[]>([]);
  const [analysisMode, setAnalysisMode] = useState<'replace' | 'append' | null>(null);


  const LOW_CONFIDENCE_THRESHOLD = 0.7;

  const responseColumnHeader = useMemo(() => {
    if (results.length === 0) return null;
    const firstResult = results[0];
    
    // Fallback for older data structures or if responseColumn is not set
    if (!('responseColumn' in firstResult) || !firstResult.responseColumn) return 'Response';

    const firstColumn = firstResult.responseColumn;
    const allSame = results.every(r => r.responseColumn === firstColumn);
    return allSame ? firstColumn : 'Response';
  }, [results]);

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
        try {
            // A robust CSV parser that handles quoted fields containing commas.
            const parseCsv = (csvText: string): { headers: string[]; data: { [key: string]: string }[] } => {
                const lines = csvText.trim().split(/\r\n?|\n/);
                if (lines.length < 2) {
                    throw new Error("CSV must have a header row and at least one data row.");
                }

                const parseLine = (line: string): string[] => {
                    const result: string[] = [];
                    let field = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (inQuotes) {
                            if (char === '"') {
                                if (i + 1 < line.length && line[i + 1] === '"') {
                                    field += '"';
                                    i++; // Skip the next quote
                                } else {
                                    inQuotes = false;
                                }
                            } else {
                                field += char;
                            }
                        } else {
                            if (char === ',') {
                                result.push(field);
                                field = '';
                            } else if (char === '"') {
                                inQuotes = true;
                            } else {
                                field += char;
                            }
                        }
                    }
                    result.push(field);
                    return result;
                };

                const headers = parseLine(lines[0]);
                const data = lines.slice(1).map(line => {
                    if (!line.trim()) return null; // Skip empty lines
                    const values = parseLine(line);
                    const row: { [key: string]: string } = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index] || '';
                    });
                    return row;
                }).filter(row => row !== null) as { [key: string]: string }[];

                return { headers, data };
            };

            const { headers, data } = parseCsv(text);
            
            setDataHeaders(headers);
            setUploadedData(data);
            
            // Auto-detect response column
            const keywords = ['response', 'comment', 'feedback', 'suggestion', 'text'];
            let detectedColumn = '';
            for (const header of headers) {
                const lowerHeader = header.toLowerCase();
                if (keywords.some(keyword => lowerHeader.includes(keyword))) {
                    detectedColumn = header;
                    break;
                }
            }
            setResponseColumn(detectedColumn);
            
            setError(null);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(`Error parsing CSV file. ${errorMessage}`);
            setDataHeaders([]);
            setUploadedData([]);
            setResponseColumn('');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  
  const handleUpdateResult = (indexToUpdate: number, field: 'themeName' | 'sentiment', value: string) => {
      const originalIndex = results.findIndex(res => res === filteredResults[indexToUpdate]);
      if (originalIndex !== -1) {
          const updatedResults = [...results];
          updatedResults[originalIndex] = { ...updatedResults[originalIndex], [field]: value };
          setResults(updatedResults);
      }
  };

  const runAnalysis = async (mode: 'replace' | 'append') => {
    if (!responseColumn) {
        setError('Please select the column containing the response text.');
        return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysisMode(mode);

    const systemInstruction = `You are an expert qualitative data analyst. Your task is to categorize user-provided text responses into a set of predefined themes.
- Analyze each response carefully.
- Assign the single most appropriate theme from the provided list.
- Determine the sentiment of the response (Positive, Negative, or Neutral).
- Provide a confidence score from 0.0 (not confident at all) to 1.0 (completely confident).
- Provide a brief reasoning for your choice.
- If a response clearly represents a new, distinct, and important theme not covered in the codebook, you may suggest a new theme.
- When suggesting a new theme, assign the 'themeName' as 'Uncategorized' and provide the new theme details in the 'suggestedTheme' field.
- Do not suggest a new theme if the response can reasonably fit into an existing one. Only use the themes provided.`;

    const themeDefinitions = themes.map(t => `- ${t.name}: ${t.description}`).join('\n');
    const responseList = uploadedData.map(row => row[responseColumn]);

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
              suggestedTheme: {
                type: Type.OBJECT,
                description: 'A new theme suggested by the AI if no existing theme fits.',
                properties: {
                    name: { type: Type.STRING, description: 'The suggested new theme name.'},
                    description: { type: Type.STRING, description: 'A brief description of the new theme.'}
                },
              },
            },
            required: ['originalResponse', 'themeName', 'sentiment', 'confidenceScore', 'reasoning'],
          },
        },
      },
      required: ['results'],
    };

    try {
      if (!ai) throw new Error('API key not set.');
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction, responseMimeType: 'application/json', responseSchema: responseSchema },
      });

      const parsedResponse = JSON.parse(response.text);
      
      const newResults: CodingResult[] = parsedResponse.results.map((analysisResult: any, index: number) => {
        // Find the original data row by matching the response text. Fallback to index if duplicates exist.
        const originalDataRow = uploadedData.find(d => d[responseColumn] === analysisResult.originalResponse) || uploadedData[index];
        return {
            themeName: analysisResult.themeName,
            sentiment: analysisResult.sentiment,
            confidenceScore: analysisResult.confidenceScore,
            reasoning: analysisResult.reasoning,
            suggestedTheme: analysisResult.suggestedTheme,
            rawData: originalDataRow,
            responseColumn: responseColumn,
        };
      });

      const suggestions = newResults.filter(r => r.suggestedTheme && r.suggestedTheme.name && r.suggestedTheme.description);
      const regularResults = newResults.filter(r => !r.suggestedTheme || !r.suggestedTheme.name);

      setPendingResults(regularResults); // Hold regular results

      if (suggestions.length > 0) {
        setSuggestedThemes(suggestions);
        setIsSuggestionModalOpen(true);
      } else {
        // No suggestions, proceed as normal
        if (mode === 'append') {
          setResults(prev => [...prev, ...regularResults]);
        } else {
          setResults(regularResults);
        }
        setPendingResults([]);
      }
      setUploadedData([]); // Clear uploaded data after successful analysis
      setDataHeaders([]);
      setResponseColumn('');
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(`An error occurred while communicating with the API. Please try again.\nDetails: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeResponses = async () => {
    if (!ai) {
        setError('Please set your Gemini API key to run the analysis.');
        return;
    }
    if (themes.length === 0 || uploadedData.length === 0 || !responseColumn) {
      setError('Please define a codebook, upload a dataset, and select the response column.');
      return;
    }

    if (results.length > 0) {
        setIsConfirmModalOpen(true);
    } else {
        await runAnalysis('replace');
    }
  };

  const handleConfirmAppend = () => {
    setIsConfirmModalOpen(false);
    runAnalysis('append');
  };
  const handleConfirmReplace = () => {
      setIsConfirmModalOpen(false);
      runAnalysis('replace');
  };
  
  const handleSuggestionsComplete = (processedSuggestions: CodingResult[], newThemes: Theme[]) => {
    addNewThemes(newThemes);

    const finalResults = [...pendingResults, ...processedSuggestions];

    if (analysisMode === 'append') {
        setResults(prev => [...prev, ...finalResults]);
    } else {
        setResults(finalResults);
    }

    // Cleanup
    setIsSuggestionModalOpen(false);
    setSuggestedThemes([]);
    setPendingResults([]);
    setAnalysisMode(null);
  };
  
  const getConfidenceColor = (score: number) => {
    if (score > 0.8) return '#4caf50'; // Green
    if (score > 0.5) return '#ffc107'; // Yellow
    return '#f44336'; // Red
  };

  const handleDownloadCSV = () => {
    if (results.length === 0) return;
    
    const resultHeaders = Object.keys(results[0].rawData);
    const analysisHeaders = ["Assigned Theme", "Sentiment", "Confidence Score", "Reasoning"];
    const headers = [...resultHeaders, ...analysisHeaders];
    
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
            ...resultHeaders.map(h => escapeCsvField(row.rawData[h])),
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
    link.setAttribute("download", "coded_responses_with_metadata.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const handleClearResults = () => {
    setResults([]);
  };
  
  const resultTableHeaders = useMemo(() => {
    if (results.length === 0) return [];
    return Object.keys(results[0].rawData);
  }, [results]);

  return (
    <>
        <div className="page-content-vertical">
            <div className="panel" role="form" aria-labelledby="responses-heading">
                <h2 id="responses-heading">Upload Dataset for Analysis</h2>
                {!ai && (
                    <div className="error" style={{marginBottom: '1rem'}}>
                        Please set your Gemini API key in the settings (⚙️ icon) to enable AI-powered analysis.
                    </div>
                )}
                <p>Upload a CSV file with responses and any relevant metadata. The first row must contain headers.</p>
                <div className="analysis-actions">
                    <label htmlFor="csv-response-upload" className="button">Upload CSV</label>
                    <input id="csv-response-upload" type="file" accept=".csv" onChange={handleResponseFileUpload} />
                    <button onClick={handleCodeResponses} disabled={isLoading || themes.length === 0 || uploadedData.length === 0 || !responseColumn || !ai} className="button">
                        {isLoading ? 'Coding...' : 'Code Responses'}
                    </button>
                </div>
                {uploadedData.length > 0 && (
                    <div className="form-group" style={{marginTop: '1.5rem'}}>
                        <label htmlFor="response-column-select">Which column contains the survey response text?</label>
                        <select id="response-column-select" value={responseColumn} onChange={e => setResponseColumn(e.target.value)}>
                            <option value="" disabled>-- Select a column --</option>
                            {dataHeaders.map(header => <option key={header} value={header}>{header}</option>)}
                        </select>
                        <p className="form-helper-text">{uploadedData.length} rows detected.</p>
                    </div>
                )}
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
                        <button onClick={() => setShowMetadata(prev => !prev)} disabled={results.length === 0} className="button small-button secondary-button">
                            {showMetadata ? 'Hide Metadata' : 'Show Metadata'}
                        </button>
                        <button onClick={handleClearResults} disabled={results.length === 0} className="button small-button tertiary-button">
                            Clear Results
                        </button>
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
                                    {showMetadata && resultTableHeaders.map(h => <th key={h}>{h}</th>)}
                                    {!showMetadata && responseColumnHeader && <th>{responseColumnHeader}</th>}
                                    {!showMetadata && resultTableHeaders.includes('rating') && <th>rating</th>}
                                    <th>Assigned Theme</th>
                                    <th>Sentiment</th>
                                    <th className="confidence-cell">Confidence</th>
                                    <th>Reasoning</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredResults.map((result, index) => (
                                    <tr key={index}>
                                        {showMetadata && resultTableHeaders.map(h => <td key={h}>{result.rawData[h]}</td>)}
                                        {!showMetadata && responseColumnHeader && (
                                            <td>
                                                {/* Access the response text using the column name stored in the result itself */}
                                                {result.rawData[result.responseColumn]}
                                            </td>
                                        )}
                                        {!showMetadata && resultTableHeaders.includes('rating') && <td>{result.rawData['rating']}</td>}
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
        <AnalysisConfirmationModal
            isOpen={isConfirmModalOpen}
            onClose={() => setIsConfirmModalOpen(false)}
            onAppend={handleConfirmAppend}
            onReplace={handleConfirmReplace}
        />
        <ThemeSuggestionModal
            isOpen={isSuggestionModalOpen}
            onClose={() => setIsSuggestionModalOpen(false)}
            suggestions={suggestedThemes}
            onComplete={handleSuggestionsComplete}
        />
    </>
  );
}


// =================================================================
// Bar Chart Component
// =================================================================
type BarChartProps = {
    title: string;
    data: Map<string, number>;
    color: string;
}
function BarChartComponent({ title, data, color }: BarChartProps) {
    const maxCount = useMemo(() => Math.max(1, ...Array.from(data.values())), [data]);
    return (
        <div className="chart-container">
            <h3>{title}</h3>
            {data.size > 0 ? (
                <div className="bar-chart">
                    {Array.from(data.entries()).map(([theme, count]) => (
                        <div key={theme} className="bar-wrapper" title={`${theme}: ${count}`}>
                            <span className="bar-label-top">{count}</span>
                            <div className="bar" style={{ height: `${(count / maxCount) * 100}%`, backgroundColor: color }}></div>
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
  ai: GoogleGenAI | null;
  reportContent: string;
  setReportContent: React.Dispatch<React.SetStateAction<string>>;
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

function ReportPage({ results, ai, reportContent, setReportContent, chatHistory, setChatHistory }: ReportPageProps) {
    const [reportPrompt, setReportPrompt] = useState(
        `Generate a summary report based on the provided thematic analysis data. Include the following sections:\n1.  **Executive Summary:** A brief overview of the key findings.\n2.  **Theme Breakdown:** Detail each theme, its frequency, and include 2-3 illustrative quotes from the original responses.\n3.  **Key Insights & Recommendations:** Conclude with actionable insights derived from the analysis.`
    );
    const [isReportLoading, setIsReportLoading] = useState(false);
    const [reportError, setReportError] = useState<string | null>(null);
    const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
    const [suggestedPrompt, setSuggestedPrompt] = useState('');
    const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);

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
        if (!ai) {
            setReportError('Please set your Gemini API key to generate a report.');
            return;
        }
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
        if (!chatInput.trim() || isChatLoading || !ai) return;

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

    const handleSuggestPrompt = async () => {
        if (!ai || results.length === 0) return;

        setIsSuggestionLoading(true);
        setReportError(null);

        const dataSample = results.slice(0, 30).map(r => r.rawData);
        
        const systemInstruction = `You are an expert data analyst. Your task is to generate a sophisticated report prompt for another AI.
First, analyze the provided sample data (JSON format) to understand its structure and content. Infer the type of survey this data represents (e.g., NPS, satisfaction survey, user feedback). Identify key metadata columns suitable for subgroup analysis (e.g., user roles, states, product types, rating scores).

Then, create a comprehensive, multi-part report prompt with the following four sections, incorporating the inferred survey type and metadata:

1.  **Executive Summary:** A section asking for a high-level overview of key findings.
2.  **Overall Thematic Analysis:** A section asking for a detailed breakdown of themes, frequency, and illustrative quotes for the entire dataset.
3.  **Subgroup Deep Dive:** A section asking for a comparative analysis of themes and sentiments across the most relevant subgroups you identify in the metadata. This should highlight key differences and similarities.
4.  **Actionable Insights & Next Steps:** A section asking for concrete recommendations and suggestions for future actions based on the analysis.

The final output must be ONLY the text for the new prompt, formatted clearly with Markdown headings for each section. Do not include any other explanation or preamble.`;

        const prompt = `Here is a sample of the data to analyze:\n\n${JSON.stringify(dataSample, null, 2)}\n\nBased on this data, generate a detailed report prompt.`;

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { systemInstruction } });
            setSuggestedPrompt(response.text);
            setIsSuggestionModalOpen(true);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setReportError(`An error occurred while suggesting a prompt. Details: ${errorMessage}`);
        } finally {
            setIsSuggestionLoading(false);
        }
    };

    const handleSaveSuggestion = (newPrompt: string) => {
        setReportPrompt(newPrompt);
        setIsSuggestionModalOpen(false);
    };
    
    return (
        <div className="page-content-vertical">
             {!ai && (
                <div className="panel error" style={{marginBottom: '0', textAlign: 'center'}}>
                    Please set your Gemini API key in the settings (⚙️ icon) to enable report generation and data chat.
                </div>
            )}
            <div className="panel data-visualization">
                <h2>Theme Sentiment Analysis</h2>
                <div className="charts-wrapper">
                    <BarChartComponent title="Positive Themes" data={themeCounts.positive} color="#28a745" />
                    <BarChartComponent title="Negative Themes" data={themeCounts.negative} color="#dc3545" />
                    <BarChartComponent title="Neutral Themes" data={themeCounts.neutral} color="#6c757d" />
                </div>
            </div>
            <div className="report-page-layout">
                {/* Left Panel: Chat */}
                <div className="panel chat-panel">
                    <h2>Chat with your Data</h2>
                    <div className="chat-history" ref={chatHistoryRef}>
                        {chatHistory.length === 0 && !ai && (
                            <div className="results-placeholder"><p>Set your API key to chat with your data.</p></div>
                        )}
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
                            disabled={isChatLoading || !ai}
                            aria-label="Chat with your data input"
                        />
                        <button type="submit" disabled={isChatLoading || !chatInput.trim() || !ai}>Send</button>
                    </form>
                </div>

                {/* Right Panel: Report Editor */}
                <div className="panel report-panel">
                    <h2>Report Editor</h2>
                    <div className="form-group">
                        <div className="label-with-action">
                           <label htmlFor="report-prompt">Report Generation Prompt</label>
                           <button 
                                onClick={handleSuggestPrompt} 
                                disabled={isSuggestionLoading || results.length === 0 || !ai} 
                                className="button small-button secondary-button"
                            >
                                {isSuggestionLoading ? 'Analyzing...' : 'Suggest Prompt'}
                            </button>
                        </div>
                        <textarea
                            id="report-prompt"
                            value={reportPrompt}
                            onChange={(e) => setReportPrompt(e.target.value)}
                            style={{ minHeight: '120px' }}
                        />
                    </div>
                    <div className="report-actions">
                        <button onClick={handleGenerateReport} disabled={isReportLoading || results.length === 0 || !ai} className="button">
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
             <PromptSuggestionModal
                isOpen={isSuggestionModalOpen}
                onClose={() => setIsSuggestionModalOpen(false)}
                onSave={handleSaveSuggestion}
                initialPrompt={suggestedPrompt}
            />
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
  
  const [apiKey, setApiKey] = useState<string | null>(() => localStorage.getItem('thematicCoder-apiKey'));
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('thematicCoder-theme', theme);
  }, [theme]);

  // Show API key modal on first load if no key is set
  useEffect(() => {
    if (!apiKey) {
      setIsModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('thematicCoder-apiKey', apiKey);
    } else {
      localStorage.removeItem('thematicCoder-apiKey');
    }
  }, [apiKey]);

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
  const [reportContent, setReportContent] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const ai = useMemo(() => (apiKey ? new GoogleGenAI({ apiKey }) : null), [apiKey]);
  
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

  const handleDeleteCodebook = (codebookNameToDelete: string) => {
    const { [codebookNameToDelete]: deleted, ...newCodebooks } = codebooks;
    
    setCodebooks(newCodebooks);
    
    setResults([]);
    setReportContent('');
    setChatHistory([]);

    if (activeCodebook === codebookNameToDelete) {
        const remainingCodebookNames = Object.keys(newCodebooks).sort();
        const newActiveCodebook = remainingCodebookNames.length > 0 ? remainingCodebookNames[0] : '';
        setActiveCodebook(newActiveCodebook);
    }
  };

  const handleAddNewThemes = (newThemes: Theme[]) => {
    if (!activeCodebook) return;
    // Filter out duplicates
    const existingThemeNames = new Set(activeThemes.map(t => t.name.toLowerCase()));
    const uniqueNewThemes = newThemes.filter(newTheme => !existingThemeNames.has(newTheme.name.toLowerCase()));

    if (uniqueNewThemes.length > 0) {
        handleSetThemes(prevThemes => [...prevThemes, ...uniqueNewThemes]);
    }
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
                  deleteCodebook={handleDeleteCodebook}
                  results={results}
               />;
      case 'analysis':
        return <AnalysisPage themes={activeThemes} results={results} setResults={setResults} ai={ai} addNewThemes={handleAddNewThemes} />;
      case 'report':
        return <ReportPage 
                  results={results} 
                  ai={ai}
                  reportContent={reportContent}
                  setReportContent={setReportContent}
                  chatHistory={chatHistory}
                  setChatHistory={setChatHistory}
                />;
      default:
        return <CodebookPage 
                  codebooks={codebooks} 
                  setCodebooks={setCodebooks}
                  activeCodebook={activeCodebook}
                  setActiveCodebook={setActiveCodebook}
                  themes={activeThemes}
                  setThemes={handleSetThemes}
                  deleteCodebook={handleDeleteCodebook}
                  results={results}
               />;
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1>Thematic Coder AI</h1>
        <div className="header-controls">
            <button onClick={() => setIsModalOpen(true)} className="settings-button" title="API Key Settings" aria-label="API Key Settings">
                ⚙️
            </button>
            <button onClick={handleThemeToggle} className="theme-switcher" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
                {theme === 'light' ? '🌙' : '☀️'}
            </button>
        </div>
      </header>
      <nav className="main-nav">
        <button onClick={() => setCurrentPage('codebook')} className={currentPage === 'codebook' ? 'active' : ''}>
          1. Codebook
        </button>
        <button onClick={() => setCurrentPage('analysis')} className={currentPage === 'analysis' ? 'active' : ''} disabled={activeThemes.length === 0 || !apiKey}>
          2. Analysis
        </button>
        <button onClick={() => setCurrentPage('report')} className={currentPage === 'report' ? 'active' : ''} disabled={results.length === 0 || !apiKey}>
          3. Report
        </button>
      </nav>
      <main>
        {renderPage()}
      </main>
      <ApiKeyModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        apiKey={apiKey} 
        setApiKey={setApiKey} 
      />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);