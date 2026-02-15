import React, { useState, useRef } from 'react';
import { Sparkles, Send, Download, Image as ImageIcon, Wand2, RefreshCw } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

const MediaStudio: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let contents: any;
      if (selectedImage) {
        // Image Editing Mode
        const base64Data = selectedImage.split(',')[1];
        contents = {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'image/png' } },
            { text: prompt }
          ]
        };
      } else {
        // Text-to-Image Mode
        contents = { parts: [{ text: prompt }] };
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents,
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          setGeneratedImageUrl(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (error) {
      console.error('Generation failed:', error);
      alert('Failed to generate image. Please check your API key and network.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-indigo-600 text-white">
            <Sparkles size={24} />
          </div>
          <h2 className="text-2xl font-bold font-poppins">AI Promotion Studio</h2>
        </div>
        <p className="text-slate-500 mb-8 font-poppins text-sm uppercase tracking-widest">Generate professional social media posts, ads, or flyers for your Indian business.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all relative overflow-hidden group"
            >
              {selectedImage ? (
                <>
                  <img src={selectedImage} alt="Source" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <p className="text-white font-bold flex items-center gap-2 font-poppins"><RefreshCw size={20} /> Change Image</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-4">
                    <ImageIcon size={32} />
                  </div>
                  <p className="text-sm font-semibold text-slate-500 font-poppins">Upload product image (Optional)</p>
                  <p className="text-xs text-slate-400 mt-1">Leave empty to generate from scratch</p>
                </>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-500 uppercase tracking-wider font-poppins">Design Prompt</label>
              <div className="relative">
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., 'Make a Diwali themed Instagram post for a sweet shop...'"
                  className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 min-h-[120px] outline-none focus:ring-2 ring-indigo-500 text-sm resize-none"
                />
                <button 
                  disabled={isGenerating || !prompt}
                  onClick={handleGenerate}
                  className="absolute bottom-4 right-4 p-3 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2 font-poppins"
                >
                  {isGenerating ? <RefreshCw size={20} className="animate-spin" /> : <Wand2 size={20} />}
                  <span className="font-bold text-sm">Create</span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-100 dark:bg-slate-800/50 rounded-3xl p-4 flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider font-poppins">Generated Design</h3>
              {generatedImageUrl && (
                <button className="flex items-center gap-1.5 text-indigo-500 text-xs font-bold hover:underline font-poppins">
                  <Download size={14} /> Download HQ
                </button>
              )}
            </div>
            
            <div className="flex-1 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center relative border border-slate-200 dark:border-slate-800">
              {isGenerating ? (
                <div className="text-center p-8">
                  <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-500 font-medium font-poppins">Gemini is sketching your vision...</p>
                </div>
              ) : generatedImageUrl ? (
                <img src={generatedImageUrl} alt="Generated" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center p-8 opacity-20">
                  <ImageIcon size={64} className="mx-auto mb-4" />
                  <p className="text-sm font-bold font-poppins">Preview will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 rounded-3xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-poppins">
        <h4 className="font-bold mb-4 flex items-center gap-2">
          <Sparkles className="text-amber-500" size={18} /> Pro Tips for Local Businesses
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
            <p className="text-sm font-bold mb-2">Festive Promotions</p>
            <p className="text-xs text-slate-500 italic leading-relaxed">"Create a Rakshabandhan sale banner with a minimalist Indian ethnic aesthetic."</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
            <p className="text-sm font-bold mb-2">Product Retouching</p>
            <p className="text-xs text-slate-500 italic leading-relaxed">"Remove the messy background and place it on a clean white marble tabletop."</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
            <p className="text-sm font-bold mb-2">Brand Consistency</p>
            <p className="text-xs text-slate-500 italic leading-relaxed">"Apply a golden-hour warm filter to this image and add an elegant border."</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaStudio;