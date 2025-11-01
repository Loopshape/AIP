import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Agent, AgentName, ChatMessage, UIMode, UploadedFile } from './types';
import * as ollamaService from './services/ollamaService';
import ThreeScene from './components/ThreeScene';

declare global {
    interface Window {
        Prism?: any;
        webkitAudioContext: typeof AudioContext
    }
}

// --- Helper Components defined outside App to prevent re-creation on re-render ---

const AgentCard: React.FC<{ agent: Agent, activePriority?: 'Low' | 'Medium' | 'High' | null }> = ({ agent, activePriority }) => (
    <div className={`agent-card transition-shadow duration-500 bg-black/20 backdrop-blur-lg border border-white/10 rounded-2xl p-4 shadow-lg ${agent.isReasoning && activePriority === 'High' ? 'shadow-lg shadow-red-500/50 ring-2 ring-red-500' : agent.isReasoning ? 'shadow-lg shadow-[#03DAC6]/50' : ''}`}>
        <div className="text-[#BB86FC] font-bold text-xl">{agent.title}</div>
        <div className="text-[#03DAC6] font-light text-sm mb-2">{agent.subtitle}</div>
        <div className="text-xs font-mono text-gray-400 mt-1 h-4">{agent.hash}</div>
        <div className="agent-content mt-3 text-sm text-gray-300 max-h-[100px] overflow-y-auto">{agent.content}</div>
    </div>
);

interface EchoCardProps {
    agent: Agent;
    onExplain: () => void;
    canExplain: boolean;
    onGenerateImage: () => void;
    canGenerateImage: boolean;
}

const EchoCard: React.FC<EchoCardProps> = ({ agent, onExplain, canExplain, onGenerateImage, canGenerateImage }) => (
     <div className={`agent-card bg-black/20 backdrop-blur-lg border border-white/10 rounded-2xl p-4 shadow-lg h-full flex flex-col transition-shadow duration-500 ${agent.isReasoning ? 'shadow-lg shadow-[#03DAC6]/50' : ''}`}>
        <div className="flex justify-between items-start">
            <div>
                <div className="text-[#BB86FC] font-bold text-xl">{agent.title}</div>
                <div className="text-[#03DAC6] font-light text-sm mb-2">{agent.subtitle}</div>
            </div>
            <div className="flex gap-2 items-center flex-shrink-0">
                 {canExplain && (
                    <button
                        onClick={onExplain}
                        className="bg-[#BB86FC] text-black font-bold rounded-lg px-3 py-1 text-xs transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        title="Get a detailed explanation of the current content"
                    >
                        Explain This
                    </button>
                )}
                {canGenerateImage && (
                     <button
                        onClick={onGenerateImage}
                        className="bg-[#03DAC6] text-black font-bold rounded-lg px-3 py-1 text-xs transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                        Generate Image
                    </button>
                )}
            </div>
        </div>
        <div className="text-xs font-mono text-gray-400 mt-1 h-4">{agent.hash}</div>
        <div className="agent-content mt-3 text-sm text-gray-300 flex-grow overflow-y-auto pr-2">{agent.content}</div>
    </div>
);

type TaskPriority = 'Low' | 'Medium' | 'High';
type Task = { id: number; prompt: string; priority: TaskPriority };

const TaskLogCard: React.FC<{
    agent: Agent;
    tasks: Task[];
    sortOrder: 'asc' | 'desc';
    onSortChange: (order: 'asc' | 'desc') => void;
}> = ({ agent, tasks, sortOrder, onSortChange }) => {
    const priorityColor: Record<TaskPriority, string> = {
        'High': 'bg-red-500',
        'Medium': 'bg-yellow-500',
        'Low': 'bg-green-500',
    };
    return (
        <div className="agent-card bg-black/20 backdrop-blur-lg border border-white/10 rounded-2xl p-4 shadow-lg h-full flex flex-col">
            <div className="text-[#BB86FC] font-bold text-xl">{agent.title}</div>
            <div className="text-[#03DAC6] font-light text-sm mb-2">{agent.subtitle}</div>
            <div className="flex justify-end gap-2 mb-2">
                <button onClick={() => onSortChange('desc')} className={`text-xs px-2 py-0.5 rounded ${sortOrder === 'desc' ? 'bg-[#BB86FC] text-black' : 'bg-white/10 text-white'}`}>High First</button>
                <button onClick={() => onSortChange('asc')} className={`text-xs px-2 py-0.5 rounded ${sortOrder === 'asc' ? 'bg-[#BB86FC] text-black' : 'bg-white/10 text-white'}`}>Low First</button>
            </div>
            <div className="agent-content mt-1 text-sm text-gray-300 flex-grow overflow-y-auto pr-2">
                {tasks.length === 0 ? <p className="text-gray-500">No tasks logged yet.</p> :
                    <ul className="space-y-2">
                        {tasks.map(task => (
                            <li key={task.id} className="flex items-center gap-2 text-xs" title={`${task.priority}: ${task.prompt}`}>
                                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${priorityColor[task.priority]}`}></span>
                                <span className="truncate flex-grow">{task.prompt}</span>
                            </li>
                        ))}
                    </ul>
                }
            </div>
        </div>
    );
};

// --- Main App Component ---

function App() {
    const [agents, setAgents] = useState<Record<AgentName, Agent>>({
        nexus: { name: 'nexus', title: 'Nexus', subtitle: 'Orchestrator (Core)', content: 'Idle. Awaiting command.', hash: '', isReasoning: false },
        cognito: { name: 'cognito', title: 'Cognito', subtitle: 'Analyzer (Loop)', content: 'Offline', hash: '', isReasoning: false },
        relay: { name: 'relay', title: 'Relay', subtitle: 'Communicator (2244)', content: 'Offline', hash: '', isReasoning: false },
        sentinel: { name: 'sentinel', title: 'Task Log', subtitle: 'Monitor (Coin)', content: '', hash: '', isReasoning: false },
        echo: { name: 'echo', title: 'Echo', subtitle: 'Reporter (Code)', content: 'Ready. Enter a command or question to begin.', hash: '', isReasoning: false },
    });
    const [currentMode, setCurrentMode] = useState<UIMode>('dashboard');
    const [isGenerating, setIsGenerating] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [selectedTextModel, setSelectedTextModel] = useState('gemini-2.5-flash');
    const [lastEchoResponse, setLastEchoResponse] = useState<string | null>(null);
    const [taskPriority, setTaskPriority] = useState<TaskPriority>('Medium');
    const [taskHistory, setTaskHistory] = useState<Task[]>([]);
    const [activeTaskPriority, setActiveTaskPriority] = useState<TaskPriority | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');


    // Chat state
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const chatInstance = useRef<any>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; content: string } | null>(null);

    // Image toolkit state
    const [uploadedImages, setUploadedImages] = useState<UploadedFile[]>([]);
    const [imageGenPrompt, setImageGenPrompt] = useState('');
    const [imageAspectRatio, setImageAspectRatio] = useState('1:1');
    const [selectedImageForAnalysis, setSelectedImageForAnalysis] = useState<UploadedFile | null>(null);
    const [imageAnalysisPrompt, setImageAnalysisPrompt] = useState('Describe this image in detail.');

    
    // Video toolkit state
    const [uploadedVideo, setUploadedVideo] = useState<UploadedFile | null>(null);
    const [videoRefImages, setVideoRefImages] = useState<UploadedFile[]>([]);
    const [videoGenPrompt, setVideoGenPrompt] = useState('');
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

    // Voice assistant state
    const [isLiveChatActive, setIsLiveChatActive] = useState(false);
    const [liveStatus, setLiveStatus] = useState('Inactive');
    const liveSession = useRef<any>(null);
    const [currentUserTranscription, setCurrentUserTranscription] = useState('');
    const [currentModelTranscription, setCurrentModelTranscription] = useState('');
    const [transcriptionHistory, setTranscriptionHistory] = useState<{user: string, model: string}[]>([]);
    const userTranscriptionRef = useRef('');
    const modelTranscriptionRef = useRef('');
    
    useEffect(() => {
      // Highlight code in echo agent when its content changes
      if(typeof agents.echo.content === 'string' && agents.echo.content.includes('```')) {
         setTimeout(() => window.Prism?.highlightAll(), 0);
      }
    }, [agents.echo.content]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        const chatHistoryContainer = document.getElementById('chat-history-container');
        window.addEventListener('click', handleClick);
        chatHistoryContainer?.addEventListener('scroll', handleClick, true);
        
        return () => {
            window.removeEventListener('click', handleClick);
            chatHistoryContainer?.removeEventListener('scroll', handleClick, true);
        };
    }, [currentMode]);
    
    const priorityValue: Record<TaskPriority, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };
    
    const sortedTasks = useMemo(() => {
        return [...taskHistory].sort((a, b) => {
            if (sortOrder === 'desc') {
                return priorityValue[b.priority] - priorityValue[a.priority];
            } else {
                return priorityValue[a.priority] - priorityValue[b.priority];
            }
        });
    }, [taskHistory, sortOrder]);


    const updateAgent = useCallback((name: AgentName, updates: Partial<Agent>) => {
        setAgents(prev => ({ ...prev, [name]: { ...prev[name], ...updates } }));
    }, []);

    const fileToBase64 = (file: File): Promise<{base64: string, mimeType: string}> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve({ base64: reader.result as string, mimeType: file.type });
            reader.onerror = error => reject(error);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<any>>, multiple = false) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        const processedFiles = await Promise.all(files.map(async file => {
            const { base64, mimeType } = await fileToBase64(file);
            return { file, base64, mimeType };
        }));

        if (multiple) {
            setter((prev: UploadedFile[]) => [...prev, ...processedFiles]);
        } else {
            setter(processedFiles[0]);
        }
    };

    const toggleGenerationState = (state: boolean) => {
        setIsGenerating(state);
        updateAgent('nexus', { 
            isReasoning: state,
            content: state ? <div className="flex items-center space-x-2"><div className="spinner w-4 h-4 border-2 border-white/20 border-l-[#03DAC6] rounded-full animate-spin"></div><span>Processing...</span></div> : 'Idle. Awaiting command.'
        });
    };
    
    const sha256 = async (message: string) => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex.slice(0, 16);
    };

    const handleDashboardSubmit = async () => {
        if (!prompt || isGenerating) return;
        setLastEchoResponse(null);
        setActiveTaskPriority(taskPriority);
        setTaskHistory(prev => [{ id: Date.now(), prompt, priority: taskPriority }, ...prev.slice(0, 49)]);
        toggleGenerationState(true);
        updateAgent('echo', { content: 'Processing prompt...', isReasoning: true });

        const requestHash = await sha256(prompt);
        updateAgent('nexus', { hash: requestHash });

        try {
            const response = await ollamaService.generateText(prompt, selectedTextModel, taskPriority);
            setLastEchoResponse(response);
            const responseHash = await sha256(response);
            updateAgent('echo', { content: response, hash: responseHash });
        } catch (error) {
            console.error(error);
            updateAgent('echo', { content: <p className="text-red-400">Error processing request.</p> });
        } finally {
            toggleGenerationState(false);
            updateAgent('echo', { isReasoning: false });
            setActiveTaskPriority(null);
        }
    };
    
    const handleExplainContent = async () => {
        if (!lastEchoResponse || isGenerating) return;
        toggleGenerationState(true);
        updateAgent('echo', { content: 'Nexus is preparing an explanation...', isReasoning: true });

        const explanationPrompt = `Please provide a detailed explanation of the following:\n\n---\n\n${lastEchoResponse}`;
        const requestHash = await sha256(explanationPrompt);
        updateAgent('nexus', { hash: requestHash, content: 'Generating explanation...' });

        try {
            const explanation = await ollamaService.generateText(explanationPrompt, selectedTextModel, 'Medium');
            const explanationHash = await sha256(explanation);
            updateAgent('echo', { content: explanation, hash: explanationHash });
            setLastEchoResponse(null); // Clear it so the "Explain" button disappears.
        } catch (error) {
            console.error(error);
            updateAgent('echo', { content: <p className="text-red-400">Error generating explanation.</p> });
        } finally {
            toggleGenerationState(false);
            updateAgent('echo', { isReasoning: false });
            updateAgent('nexus', { content: 'Idle. Awaiting command.' });
        }
    };

    const handleImageFromContent = async () => {
        if (!lastEchoResponse || isGenerating) return;

        const summaryForPrompt = lastEchoResponse.length > 150 
            ? lastEchoResponse.substring(0, 150) + '...'
            : lastEchoResponse;

        const imagePrompt = window.prompt("Enter a prompt for the image to be generated:", summaryForPrompt);
        
        if (!imagePrompt) return; // User cancelled

        toggleGenerationState(true);
        updateAgent('echo', { content: 'Contacting Sentinel to generate image...', isReasoning: true });
        const requestHash = await sha256(imagePrompt);
        updateAgent('nexus', { hash: requestHash, content: `Generating image with prompt: "${imagePrompt}"` });

        try {
            const resultBase64 = await ollamaService.generateImage(imagePrompt, "1:1");
            const imageHash = await sha256(resultBase64);
            
            updateAgent('echo', {
                content: (
                    <div className="flex flex-col items-center gap-2">
                        <img src={resultBase64} alt={imagePrompt} className="rounded-lg max-w-full h-auto object-contain" />
                        <p className="text-xs text-gray-400 font-mono italic">{imagePrompt}</p>
                    </div>
                ),
                hash: imageHash
            });
            setLastEchoResponse(null); // Clear it so action buttons disappear.
        } catch (error) {
            console.error("Image generation from content error:", error);
            updateAgent('echo', { content: <p className="text-red-400">Error generating image.</p> });
        } finally {
            toggleGenerationState(false);
            updateAgent('echo', { isReasoning: false });
            updateAgent('nexus', { content: 'Idle. Awaiting command.' });
        }
    };


    // --- Mode Specific Handlers ---
    
    const handleChatSend = async () => {
        if (!chatInput.trim() || isGenerating) return;
        const userMessage: ChatMessage = { role: 'user', content: chatInput };
        setChatHistory(prev => [...prev, userMessage]);
        setChatInput('');
        toggleGenerationState(true);

        if (!chatInstance.current) {
            chatInstance.current = ollamaService.startChat();
        }

        try {
            const response = await chatInstance.current.sendMessage({ message: userMessage.content });
            const modelMessage: ChatMessage = { role: 'model', content: response.text };
            setChatHistory(prev => [...prev, modelMessage]);
        } catch (error) {
            console.error("Chat error:", error);
            const errorMessage: ChatMessage = { role: 'model', content: "Sorry, I couldn't process that." };
            setChatHistory(prev => [...prev, errorMessage]);
        } finally {
            toggleGenerationState(false);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, content: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, content });
    };

    const handleCopyMessage = () => {
        if (!contextMenu) return;
        navigator.clipboard.writeText(contextMenu.content);
        setContextMenu(null);
    };

    const handleUseAsPrompt = () => {
        if (!contextMenu) return;
        setChatInput(contextMenu.content);
        setContextMenu(null);
        const input = document.getElementById('chat-input-field') as HTMLInputElement;
        input?.focus();
    };

    const handleImageGenerate = async () => {
        if (!imageGenPrompt || isGenerating) return;
        toggleGenerationState(true);

        try {
            const resultBase64 = await ollamaService.generateImage(imageGenPrompt, imageAspectRatio);
            const newImage: UploadedFile = {
              file: new File([], "generated.png", {type: 'image/png'}),
              base64: resultBase64,
              mimeType: 'image/png'
            }
            setUploadedImages(prev => [newImage, ...prev]);
        } catch (error) {
            console.error("Image generation error:", error);
        } finally {
            toggleGenerationState(false);
        }
    };

    const handleImageAnalysis = async () => {
        if (!selectedImageForAnalysis || !imageAnalysisPrompt || isGenerating) return;
        toggleGenerationState(true);
        updateAgent('echo', { content: 'Cognito is analyzing the image...', isReasoning: true });

        try {
            const response = await ollamaService.generateTextWithImage(imageAnalysisPrompt, selectedImageForAnalysis, selectedTextModel);
            const responseHash = await sha256(response);
            
            setCurrentMode('dashboard');
            updateAgent('echo', { content: response, hash: responseHash });
            setLastEchoResponse(response);

        } catch (error) {
            console.error("Image analysis error:", error);
            updateAgent('echo', { content: <p className="text-red-400">Error analyzing image.</p> });
        } finally {
            toggleGenerationState(false);
            updateAgent('echo', { isReasoning: false });
            setSelectedImageForAnalysis(null);
        }
    };
    
    const handleVideoGenerate = async () => {
        if (!videoGenPrompt || isGenerating) return;
        toggleGenerationState(true);
        setGeneratedVideoUrl(null);

        try {
            const result = await ollamaService.generateVideo(videoGenPrompt);
            setGeneratedVideoUrl(result.videoUri);
        } catch (error) {
            console.error("Video generation error:", error);
        } finally {
            toggleGenerationState(false);
        }
    };

    const startVoiceChat = async () => {
        if (isLiveChatActive || isGenerating) return;
        
        let stream: MediaStream | null = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            setIsLiveChatActive(true);
            setLiveStatus('Connecting...');
            userTranscriptionRef.current = '';
            modelTranscriptionRef.current = '';
            setCurrentUserTranscription('');
            setCurrentModelTranscription('');
            setTranscriptionHistory([]);

            liveSession.current = ollamaService.connectLive(stream, {
                onopen: () => {
                    setLiveStatus('Connected. Speak now.');
                },
                onmessage: (message: any) => {
                    if (message.serverContent?.inputTranscription) {
                        const newText = message.serverContent.inputTranscription.text;
                        userTranscriptionRef.current += newText;
                        setCurrentUserTranscription(prev => prev + newText);
                    }
                    if (message.serverContent?.outputTranscription) {
                        const newText = message.serverContent.outputTranscription.text;
                        modelTranscriptionRef.current += newText;
                        setCurrentModelTranscription(prev => prev + newText);
                    }
                    if (message.serverContent?.turnComplete) {
                        const userTurn = userTranscriptionRef.current;
                        const modelTurn = modelTranscriptionRef.current;

                        if (userTurn && modelTurn) {
                            setTranscriptionHistory(prev => [...prev, { user: userTurn, model: modelTurn }]);
                            userTranscriptionRef.current = '';
                            modelTranscriptionRef.current = '';
                            setCurrentUserTranscription('');
                            setCurrentModelTranscription('');
                        }
                    }
                },
                onerror: (e: any) => {
                    console.error('Live session error:', e);
                    setLiveStatus('Error');
                    stopVoiceChat();
                },
                onclose: () => {
                    setLiveStatus('Disconnected');
                    setIsLiveChatActive(false);
                    liveSession.current = null;
                },
            });
        } catch (err) {
            console.error('Failed to get microphone:', err);
            setLiveStatus('Microphone Error');
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            setIsLiveChatActive(false);
        }
    };

    const stopVoiceChat = () => {
        if (liveSession.current) {
            liveSession.current.close();
        } else {
             setIsLiveChatActive(false);
             setLiveStatus('Inactive');
        }
    };
    
    const renderModeContent = () => {
        const basePanelClass = "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(95vw,800px)] max-h-[90vh] bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-40 p-5 flex flex-col pointer-events-auto overflow-hidden";

        switch (currentMode) {
            case 'chat':
                return (
                    <div id="chat-modal" className={basePanelClass}>
                        <h3 className="text-xl font-bold text-[#BB86FC] mb-4 flex-shrink-0">Gemini Chat (Flash)</h3>
                        <div id="chat-history-container" className="flex-grow overflow-y-auto mb-4 pr-2 flex flex-col gap-2">
                           {chatHistory.map((msg, i) => {
                                const messageClasses = msg.role === 'user'
                                    ? 'bg-[#03DAC6] text-black self-end'
                                    : 'bg-black/30 self-start';
                                return (
                                   <div key={i} onContextMenu={(e) => handleContextMenu(e, msg.content)} className={`p-3 rounded-lg max-w-[80%] cursor-pointer ${messageClasses}`}>
                                       {msg.content}
                                   </div>
                                );
                           })}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                            <input id="chat-input-field" type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChatSend()} placeholder="Ask Gemini..." className="flex-grow bg-black/30 border-none rounded-lg p-3 text-white outline-none" disabled={isGenerating}/>
                            <button onClick={handleChatSend} className="bg-[#BB86FC] text-black font-bold rounded-lg px-5" disabled={isGenerating}>Send</button>
                        </div>
                    </div>
                );
            case 'image-tools':
                return (
                    <div id="image-toolkit-panel" className={basePanelClass}>
                        <h3 className="text-xl font-bold text-[#BB86FC] mb-4">Image Tools</h3>
                        <div className="flex flex-col gap-4 flex-grow overflow-y-auto pr-2">
                            <div className="flex gap-2 items-center flex-wrap">
                                <input type="file" id="image-upload-input" accept="image/*" className="hidden" multiple onChange={(e) => handleFileChange(e, setUploadedImages, true)} />
                                <label htmlFor="image-upload-input" className="bg-[#03DAC6] text-black font-bold rounded-lg p-2 cursor-pointer">Upload Images</label>
                                <input type="text" value={imageGenPrompt} onChange={e => setImageGenPrompt(e.target.value)} placeholder="e.g., A robot holding a red skateboard." className="flex-grow bg-black/30 rounded-lg p-2 outline-none"/>
                            </div>
                            <div className="flex gap-4 items-center justify-between">
                                <fieldset className="flex gap-4 items-center">
                                    <legend className="text-sm font-medium text-gray-400 mr-2">Aspect Ratio</legend>
                                    <div className="flex items-center gap-1">
                                        <input id="ratio-1-1" type="radio" name="aspect-ratio" value="1:1" checked={imageAspectRatio === '1:1'} onChange={(e) => setImageAspectRatio(e.target.value)} className="h-4 w-4 accent-[#BB86FC] bg-gray-700 border-gray-600 cursor-pointer" />
                                        <label htmlFor="ratio-1-1" className="cursor-pointer text-sm">1:1</label>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <input id="ratio-16-9" type="radio" name="aspect-ratio" value="16:9" checked={imageAspectRatio === '16:9'} onChange={(e) => setImageAspectRatio(e.target.value)} className="h-4 w-4 accent-[#BB86FC] bg-gray-700 border-gray-600 cursor-pointer" />
                                        <label htmlFor="ratio-16-9" className="cursor-pointer text-sm">16:9</label>
                                    </div>
                                </fieldset>
                                <button onClick={handleImageGenerate} className="bg-[#BB86FC] text-black font-bold rounded-lg p-2" disabled={isGenerating}>Generate (Imagen 4.0)</button>
                            </div>
                            <div className="border border-dashed border-white/20 rounded-lg min-h-[200px] p-2 flex flex-wrap gap-2 justify-center items-center">
                                {uploadedImages.length === 0 ? <p className="text-gray-500">Upload or generate images.</p> : uploadedImages.map((img, i) => (
                                    <img 
                                        key={i} 
                                        src={img.base64} 
                                        alt="preview" 
                                        className={`max-h-48 rounded-md object-contain cursor-pointer transition-all ${selectedImageForAnalysis === img ? 'ring-4 ring-[#03DAC6]' : 'ring-2 ring-transparent hover:ring-gray-500'}`}
                                        onClick={() => setSelectedImageForAnalysis(img)}
                                    />
                                ))}
                            </div>
                            <div className="flex gap-2 mt-auto pt-4 border-t border-white/20">
                                <input 
                                    type="text" 
                                    placeholder="e.g., Describe this image." 
                                    value={imageAnalysisPrompt}
                                    onChange={e => setImageAnalysisPrompt(e.target.value)}
                                    className="flex-grow bg-black/30 rounded-lg p-2 outline-none"
                                />
                                <button 
                                    onClick={handleImageAnalysis}
                                    className="bg-[#BB86FC] text-black font-bold rounded-lg p-2 transition-opacity disabled:opacity-50" 
                                    disabled={!selectedImageForAnalysis || isGenerating}
                                >
                                    Analyze
                                </button>
                                <button className="bg-white/10 text-white font-bold rounded-lg p-2 cursor-not-allowed" disabled>Edit</button>
                            </div>
                        </div>
                    </div>
                );
             case 'video-tools':
                return (
                    <div id="video-toolkit-panel" className={basePanelClass}>
                        <h3 className="text-xl font-bold text-[#BB86FC] mb-4">Video Tools</h3>
                        <div className="flex flex-col gap-4 flex-grow overflow-y-auto pr-2">
                             <div className="flex gap-2 items-center flex-wrap">
                                <input type="file" id="video-upload-input" accept="video/*" className="hidden" onChange={(e) => handleFileChange(e, setUploadedVideo)} />
                                <label htmlFor="video-upload-input" className="bg-[#03DAC6] text-black font-bold rounded-lg p-2 cursor-pointer">Upload Video</label>
                                <input type="text" value={videoGenPrompt} onChange={e => setVideoGenPrompt(e.target.value)} placeholder="e.g., a cat driving a car" className="flex-grow bg-black/30 rounded-lg p-2 outline-none"/>
                                <button onClick={handleVideoGenerate} className="bg-[#BB86FC] text-black font-bold rounded-lg p-2" disabled={isGenerating}>Generate (Veo)</button>
                            </div>
                            <div className="border border-dashed border-white/20 rounded-lg min-h-[200px] p-2 flex justify-center items-center">
                                {generatedVideoUrl ? <video src={generatedVideoUrl} controls className="max-h-64 rounded-md" /> : <p className="text-gray-500">Generate a video.</p>}
                            </div>
                        </div>
                    </div>
                );
            case 'voice-assistant':
                 return (
                    <div id="live-voice-assistant-panel" className={basePanelClass}>
                        <h3 className="text-xl font-bold text-[#BB86FC] mb-4">Live Voice Assistant</h3>
                        <div className={`text-center font-bold mb-2 ${isLiveChatActive ? 'text-green-400' : 'text-yellow-400'}`}>{liveStatus}</div>
                        <div className="flex gap-2 mb-4 justify-center">
                            <button onClick={startVoiceChat} disabled={isLiveChatActive} className="bg-[#03DAC6] text-black font-bold rounded-lg p-2 disabled:opacity-50">Start Voice Chat</button>
                            <button onClick={stopVoiceChat} disabled={!isLiveChatActive} className="bg-red-500 text-white font-bold rounded-lg p-2 disabled:opacity-50">Stop Voice Chat</button>
                        </div>
                        <div className="flex-grow bg-black/30 rounded-lg p-3 overflow-y-auto flex flex-col-reverse">
                             <div className="text-sm text-gray-400 h-10">
                                <div className="text-[#03DAC6] truncate">User: {currentUserTranscription}</div>
                                <div className="text-[#BB86FC] truncate">Model: {currentModelTranscription}</div>
                            </div>
                            {transcriptionHistory.slice().reverse().map((turn, i) => (
                                <div key={i} className="mb-2 pb-2 border-b border-gray-700 text-sm">
                                    <p className="text-[#03DAC6]"><span className="font-bold">User:</span> {turn.user}</p>
                                    <p className="text-[#BB86FC]"><span className="font-bold">Model:</span> {turn.model}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                 );
            default:
                return null;
        }
    };

    return (
        <>
            <ThreeScene />
            <div id="ui-container" className="absolute inset-0 z-20 p-4 grid grid-cols-12 grid-rows-[auto_1fr_auto] gap-4 pointer-events-none">
                {currentMode === 'dashboard' && (
                    <>
                        <div className="col-span-12 md:col-start-5 md:col-span-4 pointer-events-auto"><AgentCard agent={agents.nexus} activePriority={activeTaskPriority}/></div>
                        <div className="col-span-12 h-full min-h-0 pointer-events-auto">
                            <EchoCard 
                                agent={agents.echo} 
                                onExplain={handleExplainContent} 
                                canExplain={!!lastEchoResponse && !isGenerating}
                                onGenerateImage={handleImageFromContent}
                                canGenerateImage={!!lastEchoResponse && !isGenerating}
                            />
                        </div>
                        <div className="col-span-12 md:col-span-4 pointer-events-auto"><AgentCard agent={agents.cognito} /></div>
                        <div className="col-span-12 md:col-span-4 pointer-events-auto"><AgentCard agent={agents.relay} /></div>
                        <div className="col-span-12 md:col-span-4 pointer-events-auto">
                            <TaskLogCard agent={agents.sentinel} tasks={sortedTasks} sortOrder={sortOrder} onSortChange={setSortOrder} />
                        </div>
                    </>
                )}
            </div>

            <div id="mode-selection-bar" className="fixed top-4 left-4 z-30 bg-black/20 backdrop-blur-lg border border-white/10 rounded-xl p-2 shadow-lg flex gap-2 pointer-events-auto">
                {(['dashboard', 'chat', 'image-tools', 'video-tools', 'voice-assistant'] as UIMode[]).map(mode => (
                    <button key={mode} onClick={() => setCurrentMode(mode)} className={`px-3 py-1 rounded-lg text-sm transition-colors ${currentMode === mode ? 'bg-[#03DAC6] text-black font-bold' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                        {mode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </button>
                ))}
            </div>

            {currentMode === 'dashboard' && (
                 <div id="prompt-container" className="fixed top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-3 z-20 w-[min(90vw,700px)] bg-black/20 backdrop-blur-lg border border-white/10 rounded-xl p-4 shadow-2xl items-center pointer-events-auto">
                    <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDashboardSubmit()} placeholder="Enter command or question..." className="flex-grow bg-transparent border-b-2 border-white/20 focus:border-[#BB86FC] text-white p-2 outline-none transition-colors" disabled={isGenerating}/>
                    <select value={selectedTextModel} onChange={e => setSelectedTextModel(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg p-2 text-xs focus:ring-0 focus:outline-none focus:border-[#BB86FC]">
                        <option value="gemini-2.5-flash">Model: Flash</option>
                        <option value="gemini-2.5-flash-lite">Model: Flash Lite</option>
                    </select>
                    <select value={taskPriority} onChange={e => setTaskPriority(e.target.value as TaskPriority)} className="bg-black/30 border border-white/10 rounded-lg p-2 text-xs focus:ring-0 focus:outline-none focus:border-[#BB86FC]">
                        <option value="Low">P: Low</option>
                        <option value="Medium">P: Medium</option>
                        <option value="High">P: High</option>
                    </select>
                    <button onClick={handleDashboardSubmit} aria-label="Submit Text Prompt" className="w-12 h-12 rounded-full bg-[#03DAC6] text-black flex items-center justify-center shadow-lg shadow-[#03DAC6]/30 transition-transform active:scale-95" disabled={isGenerating}>
                         <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="currentColor"><path d="M3 3l18 9-18 9V3z"/></svg>
                    </button>
                </div>
            )}
            
            {renderModeContent()}

            {contextMenu && (
                <div
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-50 bg-black/50 backdrop-blur-lg border border-white/10 rounded-md shadow-xl p-1 flex flex-col pointer-events-auto"
                >
                    <button 
                        onClick={handleCopyMessage}
                        className="text-left w-full px-4 py-2 text-sm text-gray-200 hover:bg-[#BB86FC] hover:text-black rounded-md transition-colors"
                    >
                        Copy
                    </button>
                    <button 
                        onClick={handleUseAsPrompt}
                        className="text-left w-full px-4 py-2 text-sm text-gray-200 hover:bg-[#03DAC6] hover:text-black rounded-md transition-colors"
                    >
                        Use as Prompt
                    </button>
                </div>
            )}
        </>
    );
}

export default App;
