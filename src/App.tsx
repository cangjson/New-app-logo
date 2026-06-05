import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { 
  Upload, 
  Settings, 
  Image as ImageIcon, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  Download, 
  Monitor, 
  Code,
  AlertTriangle,
  Loader2,
  Trash2,
  Plus,
  X,
  FileImage,
  Layers,
  Save
} from 'lucide-react';
import { BRANDS as INITIAL_BRANDS } from './constants';
import { Brand, LogoConfig, ProcessedImage } from './types';

const STORAGE_KEY = 'logomaster_brand_library_v2';

export default function App() {
  // 从本地存储加载配置
  const [brands, setBrands] = useState<Brand[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_BRANDS;
  });
  
  const [selectedBrandId, setSelectedBrandId] = useState<string>(brands[0]?.id || INITIAL_BRANDS[0].id);
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'tool' | 'python'>('tool');
  const [pythonCode, setPythonCode] = useState<string>('');
  const [showManageModal, setShowManageModal] = useState(false);
  
  // 选中的品牌详情（响应式计算）
  const selectedBrand = useMemo(() => 
    brands.find(b => b.id === selectedBrandId) || brands[0], 
  [brands, selectedBrandId]);

  // UI 交互状态
  const [newBrandName, setNewBrandName] = useState('');
  const [newSize, setNewSize] = useState({ width: 1200, height: 1200 });
  const [uploadingLogoUrl, setUploadingLogoUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const logoUploadRef = useRef<HTMLInputElement>(null);

  // 同步本地存储
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brands));
  }, [brands]);

  // 加载 Python 代码预览
  useEffect(() => {
    fetch('/desktop_app.py')
      .then(res => res.text())
      .then(text => setPythonCode(text))
      .catch(() => setPythonCode('# 无法加载 Python 代码文件'));
  }, []);

  // ---------------- 核心功能逻辑 ----------------

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setIsScanning(true); 

    const checkFile = (file: File): Promise<ProcessedImage | null> => {
      return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const i = new Image();
          i.onload = () => {
            const width = i.width;
            const height = i.height;

            // Check if size matches any logo in selected brand
            const isMatch = selectedBrand.logos.some(l => l.width === width && l.height === height);

            if (isMatch) {
              resolve({
                id: Math.random().toString(36).substring(7),
                file,
                originalWidth: width,
                originalHeight: height,
                status: 'pending' as const
              });
            } else {
              resolve(null);
            }
          };
          i.onerror = () => resolve(null);
          i.src = event.target?.result as string;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    };

    const validImages: ProcessedImage[] = [];
    const chunkSize = 20;

    for (let i = 0; i < fileList.length; i += chunkSize) {
      const chunk = fileList.slice(i, i + chunkSize);
      const results = await Promise.all(chunk.map(checkFile));
      validImages.push(...results.filter((res): res is ProcessedImage => res !== null));
    }

    setImages(prev => [...prev, ...validImages]);
    setIsScanning(false);

    if (e.target) e.target.value = '';
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'image/png') {
        alert("请上传透明的 PNG 图片以保证合成效果");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadingLogoUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearAll = () => {
    if (images.length === 0) return;
    setImages([]);
    // Reset inputs to allow re-uploading same content
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const processImage = async (pImage: ProcessedImage): Promise<ProcessedImage> => {
    const brandLogo = selectedBrand.logos.find(
      l => l.width === pImage.originalWidth && l.height === pImage.originalHeight
    );

    if (!brandLogo) {
      return { ...pImage, status: 'skipped', errorMsg: `尺寸不匹配` };
    }

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ ...pImage, status: 'error', errorMsg: 'Canvas Init Fail' });
        return;
      }

      canvas.width = pImage.originalWidth;
      canvas.height = pImage.originalHeight;

      const baseImg = new Image();
      const logoImg = new Image();
      
      if (!brandLogo.url.startsWith('data:')) {
        logoImg.crossOrigin = "anonymous";
      }

      let loadedCount = 0;
      const checkLoaded = () => {
        loadedCount++;
        if (loadedCount === 2) {
          ctx.drawImage(baseImg, 0, 0);
          ctx.drawImage(logoImg, 0, 0, canvas.width, canvas.height);
          const resultUrl = canvas.toDataURL('image/jpeg', 0.95);
          resolve({ ...pImage, status: 'success', resultUrl, matchedLogo: `${brandLogo.width}x${brandLogo.height}` });
        }
      };

      baseImg.onload = checkLoaded;
      logoImg.onload = checkLoaded;
      baseImg.onerror = () => resolve({ ...pImage, status: 'error', errorMsg: '原图解析失败' });
      logoImg.onerror = () => resolve({ ...pImage, status: 'error', errorMsg: 'Logo加载失败' });

      baseImg.src = URL.createObjectURL(pImage.file);
      logoImg.src = brandLogo.url;
    });
  };

  const startBatch = async () => {
    if (images.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    // 使用 for 循序执行，确保状态更新
    for (let i = 0; i < images.length; i++) {
      const currentImg = images[i];
      if (currentImg.status === 'success' || currentImg.status === 'processing') continue;
      
      setImages(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'processing' as const } : item));
      const result = await processImage(currentImg);
      setImages(prev => prev.map((item, idx) => idx === i ? result : item));
    }
    setIsProcessing(false);
  };

  const downloadAll = async () => {
    const successItems = images.filter(img => img.status === 'success' && img.resultUrl);
    if (successItems.length === 0) return;

    const zip = new JSZip();
    
    successItems.forEach(img => {
      if (img.resultUrl) {
        const base64Data = img.resultUrl.split(',')[1];
        
        let filePath = img.file.name;
        // @ts-ignore
        if (img.file.webkitRelativePath) {
          // @ts-ignore
          const pathParts = img.file.webkitRelativePath.split('/');
          if (pathParts.length > 1) {
            // Remove the root folder name from the path for a cleaner ZIP structure
            pathParts.shift();
            filePath = pathParts.join('/');
          }
        }

        // Maintain original filename but ensure correct extension for the processed output
        filePath = filePath.replace(/\.[^/.]+$/, "") + ".jpg";

        zip.file(filePath, base64Data, { base64: true });
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `Logomaster_${selectedBrand.name}_${new Date().getTime()}.zip`;
    link.click();
  };

  // ---------------- 品牌库管理逻辑 ----------------

  const addNewBrand = () => {
    if (!newBrandName.trim()) return;
    const newBrand: Brand = {
      id: Math.random().toString(36).substring(7),
      name: newBrandName,
      logos: []
    };
    setBrands(prev => [...prev, newBrand]);
    setNewBrandName('');
    setSelectedBrandId(newBrand.id);
  };

  const deleteBrand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (brands.length <= 1) return;
    const newBrands = brands.filter(b => b.id !== id);
    setBrands(newBrands);
    if (selectedBrandId === id) {
      setSelectedBrandId(newBrands[0].id);
    }
  };

  const addSizeToBrand = (brandId: string) => {
    if (!uploadingLogoUrl) return;
    
    setBrands(prev => prev.map(b => {
      if (b.id === brandId) {
        const remaining = b.logos.filter(l => !(l.width === newSize.width && l.height === newSize.height));
        return { 
          ...b, 
          logos: [...remaining, { width: newSize.width, height: newSize.height, url: uploadingLogoUrl }] 
        };
      }
      return b;
    }));
    
    setUploadingLogoUrl(null);
    if (logoUploadRef.current) logoUploadRef.current.value = '';
  };

  const removeSizeFromBrand = (brandId: string, width: number, height: number) => {
    setBrands(prev => prev.map(b => {
      if (b.id === brandId) {
        return { ...b, logos: b.logos.filter(l => !(l.width === width && l.height === height)) };
      }
      return b;
    }));
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* 网格背景 */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: 'linear-gradient(#141414 1px, transparent 1px), linear-gradient(90deg, #141414 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* 顶部导航 */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-[#141414] text-[#E4E3E0] p-2 rounded-sm">
            <Monitor size={24} />
          </div>
          <div>
            <h1 className="font-mono font-bold text-xl uppercase tracking-tight">LogoMaster v1.2</h1>
            <p className="text-[10px] font-mono opacity-50 uppercase">Automated Batch Processor</p>
          </div>
        </div>

        <nav className="flex gap-4">
          <button 
            onClick={() => setActiveTab('tool')}
            className={`px-6 py-2 font-mono text-xs uppercase tracking-widest transition-all border-2 ${activeTab === 'tool' ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'bg-white border-transparent hover:border-[#141414]'}`}
          >
            工具界面
          </button>
          <button 
            onClick={() => setActiveTab('python')}
            className={`px-6 py-2 font-mono text-xs uppercase tracking-widest transition-all border-2 ${activeTab === 'python' ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'bg-white border-transparent hover:border-[#141414]'}`}
          >
            Python 源码
          </button>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto p-8 relative">
        <AnimatePresence mode="wait">
          {activeTab === 'tool' ? (
            <motion.div 
              key="tool"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col lg:flex-row gap-8 items-stretch"
            >
              {/* 左侧配置栏 (高度按需撑开) */}
              <div className="lg:w-1/3 flex flex-col gap-6 shrink-0">
                <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                  <header className="flex items-center justify-between gap-2 mb-6 border-b border-[#141414] pb-2">
                    <div className="flex items-center gap-2">
                      <Settings size={16} />
                      <h2 className="font-mono text-xs font-bold uppercase tracking-widest">配置中心</h2>
                    </div>
                    <button 
                      onClick={() => setShowManageModal(true)}
                      className="text-[10px] uppercase font-mono bg-[#E4E3E0] px-2 py-1 hover:bg-[#141414] hover:text-white transition-colors border border-[#141414]"
                    >
                      管理品牌库
                    </button>
                  </header>

                  <div className="space-y-4">
                    <div>
                      <label className="block font-mono text-[10px] uppercase opacity-50 mb-1 tracking-wider">选择处理品牌</label>
                      <select 
                        value={selectedBrandId}
                        onChange={(e) => setSelectedBrandId(e.target.value)}
                        className="w-full bg-[#E4E3E0] border border-[#141414] p-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#141414]"
                      >
                        {brands.map(brand => (
                          <option key={brand.id} value={brand.id}>{brand.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="p-4 bg-[#f0f0f0] border border-dashed border-[#141414]/30 rounded-sm">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-[10px] font-mono uppercase opacity-70">品牌库规格状态:</p>
                        <span className="text-[9px] font-mono bg-[#141414] text-white px-1">LOCAL-SYNC</span>
                      </div>
                      <ul className="space-y-1">
                        {selectedBrand.logos.length === 0 ? (
                          <li className="text-[10px] font-mono text-red-500 uppercase italic">该品牌尚未配置 Logo</li>
                        ) : (
                          selectedBrand.logos.map(logo => (
                            <li key={`${logo.width}-${logo.height}`} className="flex justify-between font-mono text-[11px]">
                              <span>{logo.width} x {logo.height} PNG</span>
                              <span className="text-green-600 font-bold">READY</span>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#141414] py-4 font-mono text-[10px] uppercase tracking-widest hover:bg-[#f0f0f0] transition-all group"
                      >
                        <Upload size={16} className="group-hover:translate-y-[-2px] transition-transform" />
                        <span>选择文件</span>
                      </button>
                      <button 
                        onClick={() => folderInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#141414] py-4 font-mono text-[10px] uppercase tracking-widest hover:bg-[#f0f0f0] transition-all group"
                      >
                        <Layers size={16} className="group-hover:scale-110 transition-transform" />
                        <span>导入文件夹</span>
                      </button>
                    </div>
                    
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileSelect} 
                      multiple 
                      accept="image/jpeg,image/png" 
                      className="hidden" 
                    />
                    <input 
                      type="file" 
                      ref={folderInputRef} 
                      onChange={handleFileSelect} 
                      // @ts-ignore
                      webkitdirectory="" 
                      directory="" 
                      className="hidden" 
                    />
                  </div>
                </section>

                <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(255,100,0,1)]">
                  <header className="flex items-center gap-2 mb-4">
                    <Loader2 size={16} className={isProcessing ? "animate-spin" : ""} />
                    <h2 className="font-mono text-xs font-bold uppercase tracking-widest">批处理控制区</h2>
                  </header>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      disabled={images.length === 0 || isProcessing || isScanning || selectedBrand.logos.length === 0}
                      onClick={startBatch}
                      className="py-4 bg-[#141414] text-[#E4E3E0] font-mono text-xs uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#333] transition-colors"
                    >
                      {isScanning ? '正在检索符合尺寸的图像...' : (isProcessing ? '正在处理图像队列...' : '执行一键合成任务')}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                       <button 
                        onClick={clearAll}
                        disabled={images.length === 0 || isProcessing}
                        className="flex items-center justify-center gap-2 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-colors disabled:opacity-30"
                      >
                        <Trash2 size={12} />
                        重置队列
                      </button>
                      <button 
                        onClick={downloadAll}
                        disabled={!images.some(img => img.status === 'success')}
                        className="flex items-center justify-center gap-2 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-colors disabled:opacity-30"
                      >
                        <Download size={12} />
                        批量下载
                      </button>
                    </div>
                  </div>

                  {selectedBrand.logos.length === 0 && (
                    <p className="mt-2 text-[9px] font-mono text-red-600 bg-red-50 p-2 border border-red-200">
                      警告：当前品牌无 Logo 配置，无法执行匹配合成。
                    </p>
                  )}
                </section>
              </div>

              {/* 右侧队列栏 (高度与左侧对齐) */}
              <div className="flex-1 flex flex-col h-[500px] lg:h-[660px]">
                <div className="bg-white border border-[#141414] flex flex-col h-full shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
                  <div className="bg-[#141414] text-[#E4E3E0] px-4 py-3 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                       <Layers size={14} />
                       <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold">处理队列状态 / Task Buffer</span>
                    </div>
                    <span className="font-mono text-[10px] uppercase bg-white/20 px-2 py-0.5">{images.length} ITEMS</span>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/30">
                    {images.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-[#141414]/30 min-h-[400px]">
                        <motion.div
                          animate={{ y: [0, -5, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          <ImageIcon size={64} strokeWidth={0.5} />
                        </motion.div>
                        <p className="font-mono text-xs mt-6 uppercase tracking-[0.3em] font-bold">Waiting for input assets...</p>
                        <p className="font-mono text-[10px] mt-2 opacity-50">SUPPORTS JPEG, PNG, WEBP</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#141414]/10">
                        {images.map((img) => (
                          <div key={img.id} className="p-4 flex items-center gap-4 hover:bg-[#f9f9f9] transition-colors group">
                            <div className="w-14 h-14 bg-[#f0f0f0] border border-[#141414] shrink-0 relative overflow-hidden flex items-center justify-center">
                              {img.resultUrl ? (
                                <img src={img.resultUrl} className="w-full h-full object-contain" />
                              ) : (
                                <div className="opacity-20"><ImageIcon size={20} /></div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <h4 className="font-mono text-[11px] truncate uppercase font-bold tracking-tight">{img.file.name}</h4>
                              <div className="flex items-center gap-4 mt-1">
                                <div className="flex flex-col">
                                  <span className="font-mono text-[8px] uppercase opacity-40">Original</span>
                                  <span className="font-mono text-[9px] font-bold">{img.originalWidth}x{img.originalHeight}</span>
                                </div>
                                
                                <div className="h-4 w-px bg-[#141414]/10" />

                                <div className="flex flex-col">
                                  <span className="font-mono text-[8px] uppercase opacity-40">Status</span>
                                  <div className="font-mono text-[9px] uppercase font-bold">
                                    {img.status === 'success' && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={10} /> 自动匹配成功</span>}
                                    {img.status === 'skipped' && <span className="text-orange-600 flex items-center gap-1"><AlertTriangle size={10} /> 尺寸不匹配</span>}
                                    {img.status === 'error' && <span className="text-red-600 flex items-center gap-1"><XCircle size={10} /> {img.errorMsg}</span>}
                                    {img.status === 'processing' && <span className="text-blue-600 flex items-center gap-1 animate-pulse"><Loader2 size={10} className="animate-spin" /> 处理中...</span>}
                                    {img.status === 'pending' && <span className="opacity-40 italic">等待操作</span>}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {img.status === 'success' && img.resultUrl && (
                                <a 
                                  href={img.resultUrl} 
                                  download={`${img.file.name.split('.')[0]}_final.jpg`} 
                                  className="p-2 bg-[#E4E3E0] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors border border-[#141414]"
                                  title="下载单图"
                                >
                                  <Download size={14} />
                                </a>
                              )}
                              <button 
                                onClick={() => removeImage(img.id)} 
                                className="p-2 hover:bg-red-500 hover:text-white transition-all border border-transparent hover:border-red-600 text-red-500 opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="python"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]"
            >
              <div className="bg-[#141414] text-[#E4E3E0] px-6 py-5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Code size={20} />
                  <span className="font-mono text-sm uppercase tracking-widest font-black">Desktop Native Code (PyQt6)</span>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(pythonCode);
                    alert("代码已复制！");
                  }}
                  className="bg-white text-[#141414] font-mono text-[10px] font-black uppercase px-4 py-2 hover:bg-[#E4E3E0] transition-colors"
                >
                  复制代码
                </button>
              </div>
              <div className="p-8 overflow-x-auto bg-[#1a1a1a] scrollbar-thin scrollbar-thumb-white/10">
                <pre className="text-green-400 font-mono text-xs leading-relaxed whitespace-pre">
                  {pythonCode}
                </pre>
              </div>
              <div className="p-6 bg-blue-50 border-t-2 border-[#141414]">
                 <p className="font-mono text-[11px] text-blue-900 leading-relaxed font-bold uppercase italic tracking-tighter">
                   NOTE: THIS SCRIPT REQUIRES [PYQT6] AND [PILLOW] TO RUN NATIVELY ON WINDOWS. 
                   THE CORE IMAGE PROCESSING ENGINE IS 1:1 REPLICA OF THIS WEB TOOL.
                 </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 库管理弹窗 (局部代码逻辑复用，交互增强) */}
      <AnimatePresence>
        {showManageModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                        onClick={() => setShowManageModal(false)} className="absolute inset-0 bg-[#141414]/90 backdrop-blur-md" />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-5xl bg-[#E4E3E0] border-2 border-[#141414] shadow-[15px_15px_0px_0px_rgba(255,255,255,0.1)] flex flex-col h-[90vh]"
            >
              <header className="p-5 bg-white text-[#141414] border-b-2 border-[#141414] flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3 font-mono uppercase font-black tracking-[0.2em] text-sm">
                  <Layers size={20} className="text-blue-600" />
                  品牌素材库与分辨率映射管理
                </div>
                <button onClick={() => setShowManageModal(false)} className="hover:bg-red-500 hover:text-white p-2 border-2 border-transparent transition-all">
                  <X size={24} />
                </button>
              </header>

              <div className="flex-1 flex overflow-hidden divide-x-2 divide-[#141414]">
                {/* 品牌列表 */}
                <div className="w-80 bg-[#f9f9f9] flex flex-col shrink-0">
                  <div className="p-5 border-b-2 border-[#141414] bg-white">
                    <div className="flex gap-2">
                       <input value={newBrandName} onChange={e => setNewBrandName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNewBrand()}
                              placeholder="新品牌..." className="flex-1 border-2 border-[#141414] px-3 py-2 text-xs font-mono font-bold focus:outline-none" />
                       <button onClick={addNewBrand} className="bg-[#141414] text-white px-3 py-2 hover:bg-gray-800 transition-colors">
                        <Plus size={18} />
                       </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {brands.map(brand => (
                      <div key={brand.id} onClick={() => setSelectedBrandId(brand.id)}
                           className={`p-4 font-mono text-xs cursor-pointer border-2 transition-all flex justify-between items-center group
                                     ${selectedBrandId === brand.id ? 'bg-[#141414] text-white border-[#141414]' : 'bg-white border-[#141414]/10 hover:border-[#141414]/40'}`}>
                        <div className="flex flex-col">
                           <span className="font-black uppercase tracking-tight truncate w-32">{brand.name}</span>
                           <span className={`text-[9px] opacity-40 mt-1`}>{brand.logos.length} 规格配置</span>
                        </div>
                        <button onClick={(e) => deleteBrand(brand.id, e)} className="opacity-0 group-hover:opacity-100 p-2 hover:text-red-500 transition-all">
                            <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 规格管理区域 */}
                <div className="flex-1 bg-white overflow-y-auto p-10">
                   <div className="max-w-2xl mx-auto">
                    <header className="mb-10 pb-4 border-b-4 border-[#141414]">
                      <span className="font-mono text-[10px] uppercase font-black opacity-30 italic">Active Mapping Group</span>
                      <h2 className="font-mono text-3xl font-black uppercase tracking-tighter mt-1">{selectedBrand.name}</h2>
                    </header>

                    {/* 添加区域 */}
                    <div className="bg-[#f0f0f0] border-2 border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] mb-12">
                      <h3 className="font-mono text-xs font-black uppercase mb-8 flex items-center gap-2">
                        <Plus size={16} className="text-blue-600" /> 定义新分辨率与素材对应关系
                      </h3>
                      <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="space-y-5">
                          <div>
                            <label className="block text-[10px] font-mono uppercase font-black mb-2 opacity-50 tracking-widest">目标宽像素 (W)</label>
                            <input type="number" value={newSize.width} onChange={e => setNewSize({...newSize, width: parseInt(e.target.value) || 0})}
                                   className="w-full border-2 border-[#141414] px-4 py-3 font-mono text-sm font-black focus:outline-none focus:bg-white" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono uppercase font-black mb-2 opacity-50 tracking-widest">目标高像素 (H)</label>
                            <input type="number" value={newSize.height} onChange={e => setNewSize({...newSize, height: parseInt(e.target.value) || 0})}
                                   className="w-full border-2 border-[#141414] px-4 py-3 font-mono text-sm font-black focus:outline-none focus:bg-white" />
                          </div>
                        </div>
                        <div className="flex flex-col">
                           <label className="block text-[10px] font-mono uppercase font-black mb-2 opacity-50 tracking-widest">透明 LOGO 素材 (PNG)</label>
                           <button onClick={() => logoUploadRef.current?.click()}
                                   className={`flex-1 border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 group
                                             ${uploadingLogoUrl ? 'border-green-600 bg-green-50' : 'border-[#141414]/30 hover:border-[#141414] hover:bg-white'}`}>
                              {uploadingLogoUrl ? (
                                <>
                                   <img src={uploadingLogoUrl} className="max-w-[100px] max-h-[80px] object-contain" />
                                   <span className="text-[9px] font-mono font-black text-green-700 bg-green-100 px-2 py-0.5">CONTENT LOADED</span>
                                </>
                              ) : (
                                <>
                                   <FileImage size={32} className="opacity-20 group-hover:scale-110 transition-transform" />
                                   <span className="text-[10px] font-mono font-black opacity-40">SELECT PNG</span>
                                </>
                              )}
                           </button>
                           <input type="file" ref={logoUploadRef} onChange={handleLogoUpload} accept="image/png" className="hidden" />
                        </div>
                      </div>
                      <button onClick={() => addSizeToBrand(selectedBrand.id)}
                              className="w-full bg-[#141414] text-white py-4 font-mono text-xs uppercase tracking-[0.4em] font-black hover:bg-blue-600 transition-all">
                        DEPLOY CONFIGURATION
                      </button>
                    </div>

                    {/* 已有规格 */}
                    <div className="space-y-6">
                      <div className="font-mono text-[10px] uppercase font-black opacity-30 flex items-center gap-3">
                         <span>Registry of mappings</span>
                         <div className="h-px flex-1 bg-[#141414]/10" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedBrand.logos.map((logo, idx) => (
                          <div key={idx} className="border-2 border-[#141414] p-4 flex items-center gap-5 relative group bg-white shadow-[3px_3px_0px_0px_rgba(20,20,20,0.05)] transition-shadow hover:shadow-none">
                            <div className="w-16 h-16 bg-[#141414]/5 border border-[#141414]/10 p-1 flex items-center justify-center shrink-0">
                               <img src={logo.url} className="w-full h-full object-contain" />
                            </div>
                            <div className="flex-1">
                               <div className="font-mono text-sm font-black tracking-tighter">{logo.width} x {logo.height}</div>
                               <div className="font-mono text-[8px] uppercase font-bold opacity-30">Pixel Dimension Match</div>
                            </div>
                            <button onClick={() => removeSizeFromBrand(selectedBrand.id, logo.width, logo.height)}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 opacity-0 group-hover:opacity-100 transition-opacity border-2 border-[#141414]">
                               <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 页面底部装饰性信息 */}
      <footer className="mt-20 border-t-2 border-[#141414] p-10 bg-white/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex flex-col">
             <span className="font-mono text-[10px] uppercase font-black tracking-widest leading-none">LOGOMASTER BATCH ENGINE PRO</span>
             <span className="font-mono text-[8px] uppercase opacity-40 mt-1 italic">Strict adherence to local processing constraints / No Cloud Upload</span>
          </div>
          <div className="flex gap-8 font-mono text-[10px] uppercase font-black opacity-60">
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
               SYSTEM: OPERATIONAL
             </div>
             <div>ENV: AIS-LOCAL-STORAGE</div>
             <div>VER: 1.2.BTA</div>
          </div>
        </div>
      </footer>

      {/* 自定义滚动条样式 */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #141414;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #333;
        }
      `}</style>
    </div>
  );
}
