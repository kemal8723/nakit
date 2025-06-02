
import React from 'react';
import { Submission, DepositStatus } from '../types';
import { REPORT_TIME } from '../constants';

interface ReportModalProps {
  submissions: Submission[];
  onClose: () => void;
  reportEmailRecipient: string;
}

export const ReportModal: React.FC<ReportModalProps> = ({ submissions, onClose, reportEmailRecipient }) => {
  
  // CSV download functionality is removed as per new requirements.
  // The report is now "sent" automatically (simulated).

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col text-gray-100 border-2 border-sky-500">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-semibold text-sky-400">Günlük Depozito Raporu</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Bu rapor, her gün saat <strong className="text-sky-300">{REPORT_TIME}</strong>'da XLSX formatında otomatik olarak 
          <strong className="text-sky-300"> {reportEmailRecipient} </strong> adresine gönderilecektir. 
          (Bu bir simülasyondur ve gerçek e-posta gönderimi yapmaz.)
        </p>
        
        {submissions.length === 0 ? (
          <p className="text-center text-gray-400 py-8">Bugün için kaydedilmiş işlem bulunmamaktadır.</p>
        ) : (
          <div className="overflow-y-auto flex-grow mb-6">
            <table className="w-full min-w-[600px] text-sm text-left">
              <thead className="text-xs text-sky-300 uppercase bg-slate-700 sticky top-0">
                <tr>
                  <th scope="col" className="px-4 py-3">Mağaza Adı</th>
                  <th scope="col" className="px-4 py-3">Hatırlatma</th>
                  <th scope="col" className="px-4 py-3">Durum</th>
                  <th scope="col" className="px-4 py-3">Detay</th>
                  <th scope="col" className="px-4 py-3">İşlem Saati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {submissions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{s.storeName}</td>
                    <td className="px-4 py-3">{s.reminderLabel}</td>
                    <td className={`px-4 py-3 font-semibold ${s.status === DepositStatus.DEPOSITED ? 'text-green-400' : 'text-red-400'}`}>
                      {s.status}
                    </td>
                    <td className="px-4 py-3">
                      {s.status === DepositStatus.DEPOSITED ? (
                        s.depositSlipPreview ? (
                          <a href={s.depositSlipPreview} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
                            {s.depositSlipFileName || 'Dekontu Gör'}
                          </a>
                        ) : (s.depositSlipFileName || 'Dekont Yüklendi')
                      ) : (
                        s.explanation
                      )}
                    </td>
                    <td className="px-4 py-3">{new Date(s.submittedAt).toLocaleTimeString('tr-TR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="mt-auto pt-6 border-t border-slate-700 flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4">
          {/* CSV Download button removed */}
          <button
            onClick={onClose}
            className="bg-slate-600 hover:bg-slate-500 text-gray-200 font-semibold py-2 px-6 rounded-lg shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-opacity-75"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
