import * as RadixDialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { DialogTitle, dialogVariants, dialogBackdropVariants } from './Dialog';
import { IconButton } from './IconButton';
import { providersList } from '~/lib/stores/settings';
import { db, getAll, deleteById } from '~/lib/persistence';
import { toast } from 'react-toastify';
import { useNavigate } from '@remix-run/react';
import commit from '~/commit.json';
import Cookies from 'js-cookie';
import { debug } from '~/lib/debug';
import type { LogEntry, LogLevel } from '~/lib/debug';
import { TokenUsage } from './TokenUsage';
import { setTokenLimit } from '~/lib/stores/tokenUsage';
import type { ProviderInfo } from '~/types/model';
import type { ModelInfo } from '~/utils/types';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
}

type TabType = 'chat-history' | 'providers' | 'features' | 'debug' | 'token-usage';

// Providers that support base URL configuration
const URL_CONFIGURABLE_PROVIDERS: string[] = ['Ollama', 'LMStudio', 'OpenAILike'];

const getProviderIcon = (providerName: string) => {
  switch (providerName) {
    case 'OpenAI':
      return <img src="/icons/openai.svg" alt="OpenAI" className="h-6 w-6" />;
    case 'Anthropic':
      return <img src="/icons/anthropic.svg" alt="Anthropic" className="h-6 w-6" />;
    case 'Google':
      return <img src="/icons/google.svg" alt="Google" className="h-6 w-6" />;
    case 'HuggingFace':
      return <img src="/icons/huggingface.svg" alt="HuggingFace" className="h-6 w-6" />;
    case 'Ollama':
      return <img src="/icons/ollama.svg" alt="Ollama" className="h-6 w-6" />;
    case 'Mistral':
      return <img src="/icons/mistral.svg" alt="Mistral" className="h-6 w-6" />;
    case 'Cohere':
      return <img src="/icons/cohere.svg" alt="Cohere" className="h-6 w-6" />;
    case 'Groq':
      return <img src="/icons/groq.svg" alt="Groq" className="h-6 w-6" />;
    case 'Together':
      return <img src="/icons/together.svg" alt="Together" className="h-6 w-6" />;
    case 'OpenRouter':
      return <img src="/icons/openrouter.svg" alt="OpenRouter" className="h-6 w-6" />;
    case 'Deepseek':
      return <img src="/icons/deepseek.svg" alt="Deepseek" className="h-6 w-6" />;
    case 'LMStudio':
      return <img src="/icons/lmstudio.svg" alt="LMStudio" className="h-6 w-6" />;
    case 'OpenAILike':
      return <img src="/icons/openailike.svg" alt="OpenAILike" className="h-6 w-6" />;
    case 'xAI':
      return <img src="/icons/xai.svg" alt="xAI" className="h-6 w-6" />;
    default:
      return <span className="i-ph:plug text-xl text-bolt-elements-textSecondary" />;
  }
};

export const Settings = ({ open, onClose }: SettingsProps) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('chat-history');
  const [isDebugEnabled, setIsDebugEnabled] = useState(() => debug.isDebugEnabled());
  const [isLoggingEnabled, setIsLoggingEnabled] = useState(() => {
    return localStorage.getItem('devLoggingEnabled') === 'true';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Load base URLs from cookies
  const [baseUrls, setBaseUrls] = useState(() => {
    const savedUrls = Cookies.get('providerBaseUrls');

    if (savedUrls) {
      try {
        return JSON.parse(savedUrls);
      } catch (error) {
        console.error('Failed to parse base URLs from cookies:', error);
        return {
          Ollama: 'http://localhost:11434',
          LMStudio: 'http://localhost:1234',
          OpenAILike: '',
        };
      }
    }

    return {
      Ollama: 'http://localhost:11434',
      LMStudio: 'http://localhost:1234',
      OpenAILike: '',
    };
  });

  const handleBaseUrlChange = (provider: string, url: string) => {
    setBaseUrls((prev: Record<string, string>) => {
      const newUrls = { ...prev, [provider]: url };
      Cookies.set('providerBaseUrls', JSON.stringify(newUrls));

      return newUrls;
    });
  };

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'chat-history', label: 'Chat History', icon: 'i-ph:book' },
    { id: 'providers', label: 'Providers', icon: 'i-ph:key' },
    { id: 'features', label: 'Features', icon: 'i-ph:star' },
    { id: 'token-usage', label: 'Token Usage', icon: 'i-ph:chart-line' },
    ...(isDebugEnabled ? [{ id: 'debug' as TabType, label: 'Debug Tab', icon: 'i-ph:bug' }] : []),
  ];

  // Load providers from cookies on mount
  const [providers, setProviders] = useState(() => {
    const savedProviders = Cookies.get('providers');

    if (savedProviders) {
      try {
        const parsedProviders = JSON.parse(savedProviders);

        // Merge saved enabled states with the base provider list
        return providersList.map((provider) => ({
          ...provider,
          isEnabled: parsedProviders[provider.name] || false,
        }));
      } catch (error) {
        console.error('Failed to parse providers from cookies:', error);
      }
    }

    return providersList;
  });

  const handleToggleProvider = (providerName: string) => {
    setProviders((prevProviders) => {
      const newProviders = prevProviders.map((provider) =>
        provider.name === providerName ? { ...provider, isEnabled: !provider.isEnabled } : provider,
      );

      // Save to cookies
      const enabledStates = newProviders.reduce(
        (acc, provider) => ({
          ...acc,
          [provider.name]: provider.isEnabled,
        }),
        {},
      );
      Cookies.set('providers', JSON.stringify(enabledStates));

      // Update token limits for enabled providers
      const enabledProvider = newProviders.find((p) => p.name === providerName);

      if (enabledProvider?.isEnabled) {
        // Set token limit based on the provider's models
        const providerInfo = providersList.find((p) => p.name === providerName) as unknown as ProviderInfo;

        if (providerInfo && Array.isArray(providerInfo.staticModels)) {
          const maxTokenLimit = Math.max(...providerInfo.staticModels.map((m: ModelInfo) => m.maxTokenAllowed));

          if (maxTokenLimit > 0) {
            setTokenLimit(providerName, maxTokenLimit);
          }
        }
      }

      return newProviders;
    });
  };

  const filteredProviders = providers
    .filter((provider) => provider.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const downloadAsJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDeleteAllChats = async () => {
    if (!db) {
      toast.error('Database is not available');
      return;
    }

    try {
      setIsDeleting(true);

      const allChats = await getAll(db);

      // Delete all chats one by one
      await Promise.all(allChats.map((chat) => deleteById(db!, chat.id)));

      toast.success('All chats deleted successfully');
      navigate('/', { replace: true });
    } catch {
      toast.error('Failed to delete chats');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportAllChats = async (): Promise<boolean | null> => {
    if (!db) {
      toast.error('Database is not available');
      return null;
    }

    try {
      const exportData = {
        chats: await getAll(db),
        exportDate: new Date().toISOString(),
      };

      downloadAsJson(exportData, `all-chats-${new Date().toISOString()}.json`);
      toast.success('Chats exported successfully');

      return true;
    } catch {
      toast.error('Failed to export chats');
      return false;
    }
  };

  useEffect(() => {
    localStorage.setItem('devDebugEnabled', isDebugEnabled.toString());
  }, [isDebugEnabled]);

  useEffect(() => {
    localStorage.setItem('devLoggingEnabled', isLoggingEnabled.toString());

    if (isLoggingEnabled) {
      const originalConsoleLog = console.log;
      const originalConsoleInfo = console.info;
      const originalConsoleWarn = console.warn;
      const originalConsoleError = console.error;

      console.log = function (...args) {
        const timestamp = new Date().toISOString();
        originalConsoleLog.apply(console, [`[${timestamp}] LOG:`, ...args]);
      };

      console.info = function (...args) {
        const timestamp = new Date().toISOString();
        originalConsoleInfo.apply(console, [`[${timestamp}] INFO:`, ...args]);
      };

      console.warn = function (...args) {
        const timestamp = new Date().toISOString();
        originalConsoleWarn.apply(console, [`[${timestamp}] WARN:`, ...args]);
      };

      console.error = function (...args) {
        const timestamp = new Date().toISOString();
        originalConsoleError.apply(console, [`[${timestamp}] ERROR:`, ...args]);
      };

      return () => {
        console.log = originalConsoleLog;
        console.info = originalConsoleInfo;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
      };
    }

    return undefined;
  }, [isLoggingEnabled]);

  const handleToggleDebug = () => {
    if (isDebugEnabled) {
      debug.disableDebug();
    } else {
      debug.enableDebug();
    }

    setIsDebugEnabled(!isDebugEnabled);
  };

  const DebugLogs = () => {
    const [logs, setLogs] = useState(debug.getDebugTabLogs());
    const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'all'>('all');
    const [selectedCategory, setSelectedCategory] = useState<LogEntry['category'] | 'all'>('all');

    useEffect(() => {
      // Subscribe to new log entries
      const unsubscribe = debug.addListener(() => {
        // Only update logs if we're in the Debug Tab
        if (activeTab === 'debug') {
          setLogs(debug.getDebugTabLogs());
        }
      });

      return () => {
        unsubscribe();
      };
    }, [activeTab]);

    const getLogStyle = (level: string) => {
      switch (level) {
        case 'error':
          return 'bg-bolt-elements-button-danger-background text-bolt-elements-button-danger-text';
        case 'warn':
          return 'bg-bolt-elements-messages-inlineCode-background text-bolt-elements-messages-inlineCode-text';
        case 'info':
          return 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text';
        case 'debug':
          return 'bg-bolt-elements-bg-depth-4 text-bolt-elements-textSecondary';
        default:
          return 'bg-bolt-elements-bg-depth-4 text-bolt-elements-textSecondary';
      }
    };

    const formatData = (data: unknown): string => {
      try {
        if (typeof data === 'string') {
          return data;
        }

        return JSON.stringify(data, null, 2);
      } catch {
        return '[Unable to format data]';
      }
    };

    const filteredLogs = logs.filter((log: LogEntry) => {
      const levelMatch = selectedLevel === 'all' || log.level === selectedLevel;
      const categoryMatch = selectedCategory === 'all' || log.category === selectedCategory;

      return levelMatch && categoryMatch;
    });

    const FilterButton = ({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) => (
      <button
        onClick={onClick}
        className={classNames(
          'px-2 py-1 text-xs rounded-md transition-all duration-200',
          active
            ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-item-contentActive'
            : 'bg-bolt-elements-bg-depth-2 text-bolt-elements-textTertiary hover:bg-bolt-elements-bg-depth-3 hover:text-bolt-elements-textSecondary',
        )}
      >
        {value === 'all' ? 'ALL' : value.toUpperCase()}
      </button>
    );

    return (
      <div className="mt-4 max-h-[400px] overflow-y-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
        <div className="flex flex-col space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">Debug Logs</h3>
            <button
              onClick={() => debug.clearLogs()}
              className="rounded-md px-3 py-1 text-sm text-bolt-elements-textTertiary hover:bg-bolt-elements-bg-depth-2 hover:text-bolt-elements-textSecondary transition-all duration-200"
            >
              Clear Logs
            </button>
          </div>

          <div className="flex flex-col space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-bolt-elements-textSecondary">Level:</span>
              <div className="flex space-x-2">
                <FilterButton value="all" active={selectedLevel === 'all'} onClick={() => setSelectedLevel('all')} />
                {['debug', 'info', 'warn', 'error'].map((level) => (
                  <FilterButton
                    key={level}
                    value={level}
                    active={selectedLevel === level}
                    onClick={() => setSelectedLevel(level as LogLevel)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-bolt-elements-textSecondary">Category:</span>
              <div className="flex flex-wrap gap-2">
                <FilterButton
                  value="all"
                  active={selectedCategory === 'all'}
                  onClick={() => setSelectedCategory('all')}
                />
                {['network', 'state', 'user', 'system', 'error'].map((category) => (
                  <FilterButton
                    key={category}
                    value={category}
                    active={selectedCategory === category}
                    onClick={() => setSelectedCategory(category as LogEntry['category'])}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {filteredLogs.length === 0 ? (
              <div className="rounded-md bg-bolt-elements-background-depth-3 text-sm text-bolt-elements-textTertiary text-center py-6">
                No logs match the current filters
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.timestamp}
                  className="rounded-md bg-bolt-elements-background-depth-3 p-3 text-sm space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-bolt-elements-textTertiary">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={classNames('px-2 py-0.5 rounded-md text-xs font-medium', getLogStyle(log.level))}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-bolt-elements-textSecondary">[{log.category}]</span>
                  </div>
                  <div className="text-bolt-elements-textPrimary whitespace-pre-wrap break-words">{log.message}</div>
                  {log.data && (
                    <pre className="mt-1 ml-6 text-xs text-bolt-elements-textSecondary overflow-x-auto">
                      {formatData(log.data)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onClose}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            variants={dialogBackdropVariants}
            initial="closed"
            animate="open"
            exit="closed"
          />
        </RadixDialog.Overlay>
        <RadixDialog.Content asChild>
          <motion.div
            className="fixed left-1/2 top-1/2 z-50 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl"
            variants={dialogVariants}
            initial="closed"
            animate="open"
            exit="closed"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-bolt-elements-borderColor p-6">
                <DialogTitle className="text-2xl font-semibold text-bolt-elements-textPrimary">Settings</DialogTitle>
                <IconButton onClick={onClose} icon="i-ph:x" />
              </div>

              <div className="flex flex-1 gap-4 overflow-hidden p-6">
                <div className="flex w-48 flex-col gap-2">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={classNames(
                        'flex items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm font-medium transition-all duration-200',
                        activeTab === tab.id
                          ? 'bg-bolt-elements-background-depth-4 text-bolt-elements-textPrimary shadow-sm'
                          : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
                      )}
                    >
                      <span className={classNames(tab.icon, 'text-lg')} />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-6">
                  {activeTab === 'chat-history' && (
                    <div className="flex flex-col gap-6">
                      <div>
                        <h2 className="mb-2 text-lg font-medium text-bolt-elements-textPrimary">Chat History</h2>
                        <button
                          onClick={handleExportAllChats}
                          className="inline-flex items-center gap-2 rounded-lg bg-bolt-elements-button-backgroundPrimary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bolt-elements-button-backgroundPrimaryHover"
                        >
                          <span className="i-ph:download" />
                          Export All Chats
                        </button>
                      </div>

                      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/50">
                        <h3 className="mb-2 text-lg font-medium text-red-700 dark:text-red-400">Danger Area</h3>
                        <p className="mb-4 text-sm text-red-600 dark:text-red-300">This action cannot be undone!</p>
                        <button
                          onClick={handleDeleteAllChats}
                          disabled={isDeleting}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                          {isDeleting ? (
                            <>
                              <span className="i-ph:spinner animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <span className="i-ph:trash" />
                              Delete All Chats
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'providers' && (
                    <div className="flex flex-col gap-6">
                      <div>
                        <h2 className="mb-4 text-lg font-medium text-bolt-elements-textPrimary">AI Providers</h2>
                        <div className="relative mb-4">
                          <input
                            type="text"
                            placeholder="Search providers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 pl-10 text-sm text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-bolt-elements-button-backgroundPrimary/50"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary i-ph:magnifying-glass" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {filteredProviders.map((provider) => (
                            <div
                              key={provider.name}
                              className="flex items-center justify-between rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bolt-elements-background-depth-4">
                                  {getProviderIcon(provider.name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-medium text-bolt-elements-textPrimary truncate">
                                    {provider.name}
                                  </h3>
                                  {URL_CONFIGURABLE_PROVIDERS.includes(provider.name) && (
                                    <input
                                      type="text"
                                      value={baseUrls[provider.name]}
                                      onChange={(e) => handleBaseUrlChange(provider.name, e.target.value)}
                                      placeholder="Enter base URL"
                                      className="mt-2 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-1 text-sm text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-bolt-elements-button-backgroundPrimary/50"
                                    />
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span
                                  className={classNames(
                                    'text-sm font-medium',
                                    provider.isEnabled
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-bolt-elements-textTertiary',
                                  )}
                                >
                                  {provider.isEnabled ? 'Enabled' : 'Disabled'}
                                </span>
                                <button
                                  onClick={() => handleToggleProvider(provider.name)}
                                  className={classNames(
                                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-bolt-elements-button-backgroundPrimary focus:ring-offset-2',
                                    provider.isEnabled
                                      ? 'bg-green-500 dark:bg-green-600'
                                      : 'bg-gray-200 dark:bg-gray-600',
                                  )}
                                  role="switch"
                                  aria-checked={provider.isEnabled}
                                >
                                  <span
                                    className={classNames(
                                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                      provider.isEnabled ? 'translate-x-5' : 'translate-x-0',
                                    )}
                                  />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'features' && (
                    <div className="flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Developer Tools</h2>
                        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                          Advanced settings for debugging and development
                        </p>
                        <div className="mt-4 space-y-4">
                          <div className="flex items-center justify-between rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                            <div>
                              <h3 className="font-medium text-bolt-elements-textPrimary">Debug Mode</h3>
                              <p className="text-sm text-bolt-elements-textSecondary">
                                Enable detailed error messages and debugging information
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className={classNames(
                                  'text-sm font-medium',
                                  isDebugEnabled
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-bolt-elements-textTertiary',
                                )}
                              >
                                {isDebugEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                              <button
                                onClick={handleToggleDebug}
                                className={classNames(
                                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-bolt-elements-button-backgroundPrimary focus:ring-offset-2',
                                  isDebugEnabled ? 'bg-green-500 dark:bg-green-600' : 'bg-gray-200 dark:bg-gray-600',
                                )}
                                role="switch"
                                aria-checked={isDebugEnabled}
                              >
                                <span
                                  className={classNames(
                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                    isDebugEnabled ? 'translate-x-5' : 'translate-x-0',
                                  )}
                                />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                            <div>
                              <h3 className="font-medium text-bolt-elements-textPrimary">Console Logging</h3>
                              <p className="text-sm text-bolt-elements-textSecondary">
                                Show detailed logs in browser console
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className={classNames(
                                  'text-sm font-medium',
                                  isLoggingEnabled
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-bolt-elements-textTertiary',
                                )}
                              >
                                {isLoggingEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                              <button
                                onClick={() => setIsLoggingEnabled(!isLoggingEnabled)}
                                className={classNames(
                                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-bolt-elements-button-backgroundPrimary focus:ring-offset-2',
                                  isLoggingEnabled ? 'bg-green-500 dark:bg-green-600' : 'bg-gray-200 dark:bg-gray-600',
                                )}
                                role="switch"
                                aria-checked={isLoggingEnabled}
                              >
                                <span
                                  className={classNames(
                                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                    isLoggingEnabled ? 'translate-x-5' : 'translate-x-0',
                                  )}
                                />
                              </button>
                            </div>
                          </div>

                          {isDebugEnabled && (
                            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                              <h3 className="font-medium text-bolt-elements-textPrimary">Debug Information</h3>
                              <div className="mt-2">
                                <pre className="overflow-auto text-sm text-bolt-elements-textSecondary">
                                  <code>
                                    {JSON.stringify(
                                      {
                                        version: commit.commit,
                                        os: navigator.platform,
                                        browser: navigator.userAgent,
                                        providers: providers.filter((p) => p.isEnabled).map((p) => p.name),
                                        baseUrls: {
                                          ...baseUrls,
                                          OpenAI: process.env.REACT_APP_OPENAI_URL,
                                        },
                                      },
                                      null,
                                      2,
                                    )}
                                  </code>
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'token-usage' && (
                    <div className="flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Token Usage</h2>
                        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                          Track and monitor your token consumption
                        </p>
                        <TokenUsage className="mt-4" />
                      </div>
                    </div>
                  )}

                  {activeTab === 'debug' && (
                    <div className="flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Debug Information</h2>
                        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                          View detailed debug logs and information
                        </p>
                        <DebugLogs />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
