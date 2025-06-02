
import React, { useState, useEffect, ChangeEvent, useRef, useMemo, useCallback } from 'react';
import { ReminderSlot, DepositStatus, Submission, ReminderId } from '../types';
import { STORE_NAMES } from '../constants';

const normalizeTurkishStringSearch = (str: string): string => {
  if (!str) return '';
  let normalized = str.toLocaleLowerCase('tr-TR');
  normalized = normalized
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g');
  return normalized;
};

const NORMALIZED_STORE_NAMES_MAP = new Map<string, string>();
STORE_NAMES.forEach(name => {
  NORMALIZED_STORE_NAMES_MAP.set(name, normalizeTurkishStringSearch(name));
});

interface ReminderCardProps {
  reminderSlot: ReminderSlot;
  onSaveSubmission: (submissionData: Omit<Submission, 'id' | 'submittedAt'>) => void;
  allSubmissionsToday: Submission[];
  isSlotActive: boolean; // True if the slot's time has passed for today
}

export const ReminderCard: React.FC<ReminderCardProps> = ({
  reminderSlot,
  onSaveSubmission,
  allSubmissionsToday,
  isSlotActive,
}) => {
  const [selectedStoreName, setSelectedStoreName] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>(''); // For store search input
  const [status, setStatus] = useState<DepositStatus | ''>('');
  const [depositSlipFile, setDepositSlipFile] = useState<File | null>(null);
  const [depositSlipPreview, setDepositSlipPreview] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  const [storeSpecificExistingSubmission, setStoreSpecificExistingSubmission] = useState<Submission | undefined>(undefined);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Effect to derive storeSpecificExistingSubmission based on selected store and all submissions
  useEffect(() => {
    if (selectedStoreName && reminderSlot) {
      const found = allSubmissionsToday.find(
        s => s.storeName === selectedStoreName && s.reminderId === reminderSlot.id
      );
      setStoreSpecificExistingSubmission(found);
    } else {
      setStoreSpecificExistingSubmission(undefined);
    }
  }, [selectedStoreName, allSubmissionsToday, reminderSlot]);

  // Effect to update form fields when storeSpecificExistingSubmission changes or store is deselected
  useEffect(() => {
    if (storeSpecificExistingSubmission) {
      // A submission exists for the selected store and this slot
      setInputValue(''); // Clear search input
      setStatus(storeSpecificExistingSubmission.status);
      setExplanation(storeSpecificExistingSubmission.explanation || '');
      setDepositSlipPreview(storeSpecificExistingSubmission.depositSlipPreview || null);
      setDepositSlipFile(null); // Clear any held file object
      setIsDropdownOpen(false); // Close dropdown
    } else {
      // No submission for the selected store/slot, or no store selected
      // Reset form fields (important when changing selectedStoreName or if it's cleared)
      // Don't reset selectedStoreName itself here, that's user-driven
      setStatus('');
      setExplanation('');
      setDepositSlipFile(null);
      setDepositSlipPreview(null);
      // setInputValue(''); // Keep input value if user is searching for a store
    }
  }, [storeSpecificExistingSubmission]);


  useEffect(() => {
    if (isDropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isDropdownOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        // setInputValue(''); // Do not clear input on blur, user might want to re-open with same search
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log('ReminderCard: Camera/File input changed. File:', file ? { name: file.name, size: file.size, type: file.type } : 'No file');
    if (file) {
      setDepositSlipFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) setDepositSlipPreview(reader.result as string);
        else { setDepositSlipPreview(null); setDepositSlipFile(null); alert('Dosya önizlemesi oluşturulamadı.'); }
      };
      reader.onerror = (error) => {
        console.error('ReminderCard: FileReader: onerror:', error);
        setDepositSlipFile(null); setDepositSlipPreview(null);
        alert('Dosya okunurken bir hata oluştu.');
      };
      reader.readAsDataURL(file);
    } else {
      setDepositSlipFile(null); setDepositSlipPreview(null);
    }
    if (event.target) try { event.target.value = ''; } catch (e) { console.warn('ReminderCard: Could not reset input value:', e); }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStoreName) { alert('Lütfen geçerli bir mağaza adı seçin.'); return; }
    if (!status) { alert('Lütfen yatırma durumunu seçin.'); return; }
    if (status === DepositStatus.NOT_DEPOSITED && !explanation) { alert('Lütfen yatırılmama nedenini açıklayın.'); return; }
    // For new submissions (storeSpecificExistingSubmission is undefined), depositSlipPreview must come from current file
    if (status === DepositStatus.DEPOSITED && !depositSlipPreview) {
       alert('Lütfen dekont görseli ekleyin.'); return;
    }

    const submissionPayload = {
      reminderId: reminderSlot.id,
      reminderLabel: reminderSlot.label,
      storeName: selectedStoreName,
      status,
      depositSlipFile: depositSlipFile, // Pass the file object
      depositSlipPreview: depositSlipPreview, // Pass the current preview
      depositSlipFileName: depositSlipFile?.name || (status === DepositStatus.DEPOSITED && depositSlipPreview ? "camera_capture.jpg" : undefined),
      explanation: status === DepositStatus.NOT_DEPOSITED ? explanation : undefined,
    };
    try {
        onSaveSubmission(submissionPayload);
    } catch (error) {
        console.error("ReminderCard: handleSubmit: Error calling onSaveSubmission:", error);
        alert("Kaydetme sırasında bir hata oluştu."); return;
    }
    // UI will update automatically when allSubmissionsToday prop changes and storeSpecificExistingSubmission is re-derived
    setIsDropdownOpen(false); 
    // setInputValue(''); // Input value is part of store selection, not form data.
    // Form fields will be reset/updated by the useEffect hook reacting to storeSpecificExistingSubmission change
  };

  const cardBorderColor = storeSpecificExistingSubmission ? 'border-green-500' : isSlotActive ? 'border-sky-500' : 'border-slate-600';
  const cardBgColor = storeSpecificExistingSubmission ? 'bg-slate-700' : 'bg-slate-800';
  
  // Use depositSlipPreview from state for new submissions, or from existing for viewing.
  const currentPreviewSrc = storeSpecificExistingSubmission 
    ? storeSpecificExistingSubmission.depositSlipPreview 
    : depositSlipPreview;

  const storesForDropdown = useMemo(() => {
    if (!isDropdownOpen) return [];
    const currentSearchTerm = inputValue.trim();
    if (currentSearchTerm === '') return STORE_NAMES.sort((a,b) => a.localeCompare(b, 'tr-TR')); // Show all if input is empty but open
    
    const normalizedSearchTerm = normalizeTurkishStringSearch(currentSearchTerm);
    return STORE_NAMES.filter(name => {
        const normalizedName = NORMALIZED_STORE_NAMES_MAP.get(name);
        return normalizedName ? normalizedName.includes(normalizedSearchTerm) : false;
    }).sort((a, b) => {
        const normalizedA = NORMALIZED_STORE_NAMES_MAP.get(a)!;
        const normalizedB = NORMALIZED_STORE_NAMES_MAP.get(b)!;
        let scoreA = 2; if (normalizedA === normalizedSearchTerm) scoreA = 0; else if (normalizedA.startsWith(normalizedSearchTerm)) scoreA = 1;
        let scoreB = 2; if (normalizedB === normalizedSearchTerm) scoreB = 0; else if (normalizedB.startsWith(normalizedSearchTerm)) scoreB = 1;
        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.toLocaleLowerCase('tr-TR').localeCompare(b.toLocaleLowerCase('tr-TR'), 'tr-TR');
    });
  }, [inputValue, isDropdownOpen]);

  const handleTriggerClick = () => {
    const nextDropdownState = !isDropdownOpen;
    setIsDropdownOpen(nextDropdownState);
    if (!nextDropdownState) setInputValue(''); // Clear search on close
  };
  const handleStoreSelect = (store: string) => { setSelectedStoreName(store); setInputValue(''); setIsDropdownOpen(false); };
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (!isDropdownOpen && e.target.value.trim() !== '') setIsDropdownOpen(true);
  };

  return (
    <div className={`p-6 rounded-xl shadow-2xl transition-all duration-300 border-2 ${cardBorderColor} ${cardBgColor}`}>
      <h3 className="text-2xl font-semibold mb-1 text-sky-400">{reminderSlot.label}</h3>
      <p className="text-sm text-gray-400 mb-4">Planlanan Saat: {reminderSlot.time}</p>

      {storeSpecificExistingSubmission ? (
        // View for when a submission for this store/slot exists
        <div className="text-center py-4">
          <p className="text-xl text-green-400 font-semibold">
            Bu işlem için <strong className="text-green-300">{selectedStoreName}</strong> tarafından kayıt gönderildi.
          </p>
          <p className="text-gray-300 mt-1">Durum: {storeSpecificExistingSubmission.status}</p>
          {storeSpecificExistingSubmission.status === DepositStatus.DEPOSITED && storeSpecificExistingSubmission.depositSlipPreview && (
            <img src={storeSpecificExistingSubmission.depositSlipPreview} alt="Dekont Önizleme" className="mt-2 mx-auto h-24 object-contain rounded" />
          )}
          {storeSpecificExistingSubmission.status === DepositStatus.DEPOSITED && storeSpecificExistingSubmission.depositSlipFileName && (
             <p className="text-xs text-gray-400 mt-1">Dosya: {storeSpecificExistingSubmission.depositSlipFileName}</p>
          )}
          {storeSpecificExistingSubmission.status === DepositStatus.NOT_DEPOSITED && (
            <p className="text-gray-300 mt-1">Açıklama: {storeSpecificExistingSubmission.explanation}</p>
          )}
          <p className="text-xs text-gray-500 mt-2">İşlem Saati: {new Date(storeSpecificExistingSubmission.submittedAt).toLocaleTimeString('tr-TR')}</p>
        </div>
      ) : !isSlotActive ? (
        // View for when slot is not yet active (globally)
         <div className="text-center py-4">
          <p className="text-gray-500">Bu hatırlatma henüz aktif değil.</p>
          {!selectedStoreName && <p className="text-sm text-gray-400 mt-1">Giriş yapmak veya durumu görmek için lütfen bir mağaza seçin.</p>}
        </div>
      ) : (
        // Form view: Slot is active, and no submission yet for selectedStoreName (or no store selected yet)
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label htmlFor={`storeName-trigger-${reminderSlot.id}`} className="block text-sm font-medium text-gray-300 mb-1">Mağaza Adı</label>
            <button
              type="button"
              ref={triggerRef}
              id={`storeName-trigger-${reminderSlot.id}`}
              onClick={handleTriggerClick}
              className="block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-left focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 sm:text-sm text-gray-100"
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              aria-controls={`storeName-listbox-${reminderSlot.id}`}
            >
              {selectedStoreName || <span className="text-gray-400">Mağaza seçin...</span>}
               <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 3a.75.75 0 01.53.22l3.5 3.5a.75.75 0 01-1.06 1.06L10 4.81 6.03 8.78a.75.75 0 01-1.06-1.06l3.5-3.5A.75.75 0 0110 3zm-3.78 9.22a.75.75 0 011.06 0L10 15.19l2.97-2.97a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </span>
            </button>

            {isDropdownOpen && (
              <div ref={dropdownRef} id={`storeName-listbox-${reminderSlot.id}`} role="listbox" className="absolute z-20 mt-1 w-full bg-slate-600 border border-slate-500 rounded-md shadow-lg">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Mağaza ara..."
                  value={inputValue}
                  onChange={handleSearchInputChange}
                  className="block w-full bg-slate-700 border-b border-slate-500 rounded-t-md py-2 px-3 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm text-gray-100"
                  autoComplete="off"
                  aria-label="Mağaza arama"
                />
                <div className="max-h-60 overflow-y-auto rounded-b-md">
                  {storesForDropdown.map(name => (
                      <div
                        key={name}
                        onClick={() => handleStoreSelect(name)}
                        className={`cursor-pointer px-3 py-2 hover:bg-sky-600 hover:text-white text-gray-200 text-sm ${selectedStoreName === name ? 'bg-sky-700 text-white' : ''}`}
                        role="option"
                        aria-selected={name === selectedStoreName}
                      >
                        {name}
                      </div>
                    ))}
                  {isDropdownOpen && storesForDropdown.length === 0 && inputValue.trim() !== '' && (
                    <div className="px-3 py-2 text-gray-400 text-sm">Sonuç bulunamadı</div>
                  )}
                  {isDropdownOpen && inputValue.trim() === '' && storesForDropdown.length > 10 && ( // Only show if many stores and empty search
                     <div className="px-3 py-2 text-gray-400 text-sm">Eşleşen mağazaları görmek için mağaza adı yazmaya başlayın veya listeden seçin.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Rest of the form enabled only if a store is selected */}
          {selectedStoreName && (
            <>
              <div>
                <span className="block text-sm font-medium text-gray-300">Durum</span>
                <div className="mt-2 space-x-2 sm:space-x-4 flex">
                  <button
                    type="button"
                    onClick={() => setStatus(DepositStatus.DEPOSITED)}
                    className={`px-3 py-2 rounded-md text-sm font-medium w-1/2 ${status === DepositStatus.DEPOSITED ? 'bg-green-500 text-white ring-2 ring-green-300' : 'bg-slate-600 hover:bg-slate-500 text-gray-300'}`}
                    aria-pressed={status === DepositStatus.DEPOSITED}
                  >
                    Yatırıldı
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(DepositStatus.NOT_DEPOSITED)}
                    className={`px-3 py-2 rounded-md text-sm font-medium w-1/2 ${status === DepositStatus.NOT_DEPOSITED ? 'bg-red-500 text-white ring-2 ring-red-300' : 'bg-slate-600 hover:bg-slate-500 text-gray-300'}`}
                    aria-pressed={status === DepositStatus.NOT_DEPOSITED}
                  >
                    Yatırılmadı
                  </button>
                </div>
              </div>

              {status === DepositStatus.DEPOSITED && (
                <div>
                  <label className="block text-sm font-medium text-gray-300">Dekont Görseli</label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full text-sm text-gray-200 bg-sky-600 hover:bg-sky-700 py-2 px-3 rounded-md font-semibold transition duration-150"
                      aria-label="Dekont dosyası seç"
                    >
                      Dosya Seç
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full text-sm text-gray-200 bg-teal-600 hover:bg-teal-700 py-2 px-3 rounded-md font-semibold transition duration-150"
                      aria-label="Dekont fotoğrafı çek"
                    >
                      Fotoğraf Çek
                    </button>
                  </div>
                  <input type="file" ref={fileInputRef} id={`depositSlip-file-${reminderSlot.id}`} onChange={handleFileChange} accept="image/*" className="hidden" aria-hidden="true" />
                  <input type="file" ref={cameraInputRef} id={`depositSlip-camera-${reminderSlot.id}`} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" aria-hidden="true" />
                  {currentPreviewSrc && ( // This is now just 'depositSlipPreview' from state for new submissions
                    <img
                      src={currentPreviewSrc}
                      alt="Dekont Önizleme"
                      className="mt-3 h-24 object-contain rounded mx-auto"
                      onError={(e) => { e.currentTarget.style.display='none'; console.error("ReminderCard: Error loading image preview:", currentPreviewSrc.substring(0,50) + "..."); }}
                    />
                  )}
                </div>
              )}

              {status === DepositStatus.NOT_DEPOSITED && (
                <div>
                  <label htmlFor={`explanation-${reminderSlot.id}`} className="block text-sm font-medium text-gray-300">Açıklama (Zorunlu)</label>
                  <textarea
                    id={`explanation-${reminderSlot.id}`}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full bg-slate-700 border-slate-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-sky-500 focus:border-sky-500 sm:text-sm text-gray-100"
                    required
                    aria-label="Yatırılmama nedeni açıklaması"
                  />
                </div>
              )}
              {/* Submit button should only be active if a store is selected and status is set */}
              {(status) && ( 
                <button
                  type="submit"
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-4 rounded-md shadow-md transition duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-75"
                  aria-label="Kaydı gönder"
                >
                  Kaydet
                </button>
              )}
            </>
          )}
          {!selectedStoreName && isSlotActive && (
             <p className="text-sm text-yellow-300 mt-3 text-center">İşlem yapmak için lütfen önce bir mağaza seçin.</p>
          )}
        </form>
      )}
    </div>
  );
};
