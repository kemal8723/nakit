import React from 'react';
import { APP_TITLE } from '../constants';

export const Header: React.FC = () => {
  const watsonsLogoUrl = 'https://www.watsons.com.tr/medias/sys_master/images/h5e/hc0/12006938902558/Watsons--20Yil_Logo_Site_Yatay/Watsons-20Yil-Logo-Site-Yatay.png';

  return (
    <header className="w-full py-4 px-4 bg-slate-800 shadow-xl flex flex-col sm:flex-row items-center justify-center text-center sm:text-left">
      <img src={watsonsLogoUrl} alt="Watsons Logo" className="h-12 sm:h-16 mr-0 sm:mr-4 mb-2 sm:mb-0"/>
      <h1 
        className="font-montserrat text-4xl sm:text-5xl font-bold text-sky-400 tracking-tight [text-shadow:1px_1px_3px_rgba(0,0,0,0.2)]"
        style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.3)' }} // Tailwind JIT might handle the arbitrary value, but inline style is safer for text-shadow
      >
        {APP_TITLE}
      </h1>
    </header>
  );
};