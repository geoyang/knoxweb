import React, { useState } from 'react';

interface StepCardProps {
  number: number;
  title: string;
  description: string;
  illustration: React.ReactNode;
  tip?: React.ReactNode;
}

function StepCard({ number, title, description, illustration, tip }: StepCardProps) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
      <div className="bg-gray-50 py-6 flex items-center justify-center">{illustration}</div>
      <div className="p-5 space-y-2">
        <span className="inline-block bg-[#1877F2] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">
          Step {number}
        </span>
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        <p className="text-[13px] text-gray-500 leading-relaxed whitespace-pre-line">{description}</p>
        {tip && (
          <div className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2.5 mt-2">
            <span className="text-amber-500 mt-0.5">&#128161;</span>
            <span className="text-[12px] text-amber-700 leading-snug">{tip}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const TOTAL_STEPS = 9;

const STEPS: Omit<StepCardProps, 'illustration'>[] = [
  {
    number: 1,
    title: 'Open "Settings & Privacy"',
    description: 'On Facebook, tap the menu icon, then go to Settings & Privacy > Settings.',
    tip: (
      <>
        On a computer? Go directly to{' '}
        <a
          href="https://accountscenter.facebook.com/info_and_permissions/dyi"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium text-amber-800 hover:text-amber-900"
        >
          accountscenter.facebook.com
        </a>{' '}
        and skip to step 4.
      </>
    ),
  },
  {
    number: 2,
    title: 'Tap "See more in Accounts Center"',
    description: 'Scroll down to the Meta Accounts Center section and tap "See more in Accounts Center".',
  },
  {
    number: 3,
    title: 'Select "Your information and permissions"',
    description: 'In the Accounts Center sidebar, tap "Your information and permissions", then tap "Export your information".',
  },
  {
    number: 4,
    title: 'Select "Export to device"',
    description: 'Choose to export the data to your device so you can pick it up as a ZIP file.',
  },
  {
    number: 5,
    title: 'Choose your format',
    description: 'JSON is recommended for the best import experience. HTML also works — Kizu supports both formats.',
    tip: 'JSON includes more metadata. If you already have an HTML export, that works too.',
  },
  {
    number: 6,
    title: 'Set Date range to "All time"',
    description: 'Select All time to get your complete Facebook history, or choose a custom range.',
  },
  {
    number: 7,
    title: 'Set Media quality to "Higher quality"',
    description: 'This ensures your photos and videos are imported at the best resolution.',
  },
  {
    number: 8,
    title: 'Click "Start export" and wait',
    description: "Facebook will prepare your file and notify you when it's ready. This can take minutes to hours.\n\nYou have 4 days to download it once it's ready.",
    tip: 'Save the ZIP somewhere easy to find, like your Desktop or Downloads folder.',
  },
  {
    number: 9,
    title: 'Select the file in Kizu',
    description: 'Click the button below to pick your Facebook export ZIP. Kizu will read it, show you a summary, and start importing.',
  },
];

const ILLUSTRATIONS: React.ReactNode[] = [
  <SettingsPrivacyIllustration />,
  <AccountsCenterIllustration />,
  <YourInfoIllustration />,
  <ExportToDeviceIllustration />,
  <FormatIllustration />,
  <DateRangeIllustration />,
  <QualityIllustration />,
  <StartExportIllustration />,
  <ImportIllustration />,
];

export function FacebookImportGuide() {
  // step 0 = hero, steps 1-9 = instruction steps
  const [step, setStep] = useState(0);

  return (
    <div className="space-y-4">
      {step === 0 ? (
        /* Hero screen */
        <div className="text-center py-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <FbLogo />
            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center border-2 border-gray-200">
              <span className="text-white font-bold text-xl">K</span>
            </div>
          </div>
          <h1 className="text-xl font-bold text-gray-900 leading-snug">
            Bring your memories<br />from Facebook
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Import your photos, videos, comments, and reactions in just a few steps.
          </p>
          <button
            onClick={() => setStep(1)}
            className="mt-6 px-6 py-2.5 bg-[#1877F2] text-white text-sm font-semibold rounded-full hover:bg-[#166FE5] transition-colors"
          >
            Get Started
          </button>
        </div>
      ) : (
        /* Step card */
        <StepCard
          {...STEPS[step - 1]}
          illustration={ILLUSTRATIONS[step - 1]}
        />
      )}

      {/* Step dots */}
      {step > 0 && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <button
              key={i}
              onClick={() => setStep(i + 1)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i + 1 === step ? 'bg-[#1877F2]' : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Navigation */}
      {step > 0 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setStep(step - 1)}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            {step === 1 ? '← Overview' : '← Back'}
          </button>
          <span className="text-xs text-gray-400">{step} of {TOTAL_STEPS}</span>
          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep(step + 1)}
              className="text-sm text-[#1877F2] hover:text-[#166FE5] font-medium"
            >
              Next →
            </button>
          ) : (
            <span className="text-sm text-gray-300">Last step</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dark-themed Facebook UI mockups                                   */
/* ------------------------------------------------------------------ */

function FbLogo() {
  return (
    <div className="w-12 h-12 bg-[#1877F2] rounded-full flex items-center justify-center">
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    </div>
  );
}

function FbScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-60 rounded-xl bg-[#1C1E21] p-3.5 space-y-1.5 text-left">
      {children}
    </div>
  );
}

function FbSubheader({ text }: { text: string }) {
  return <p className="text-[10px] text-[#B0B3B8]">{text}</p>;
}

function FbTitle({ text }: { text: string }) {
  return <h4 className="text-[15px] font-bold text-[#E4E6EB] !mt-0">{text}</h4>;
}

function FbDesc({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] text-[#B0B3B8] leading-[13px]">{children}</p>;
}

function FbButton({ text }: { text: string }) {
  return (
    <div className="bg-[#4F46E5] rounded-lg py-2 text-center mt-2">
      <span className="text-white text-[11px] font-bold">{text}</span>
    </div>
  );
}

function RadioOn() {
  return (
    <div className="w-4 h-4 rounded-full border-[1.5px] border-[#4599FF] flex items-center justify-center shrink-0">
      <div className="w-2 h-2 rounded-full bg-[#4599FF]" />
    </div>
  );
}

function RadioOff() {
  return <div className="w-4 h-4 rounded-full border-[1.5px] border-[#B0B3B8] shrink-0" />;
}

function ChevronRight() {
  return (
    <svg className="w-2.5 h-2.5 text-[#B0B3B8] shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  );
}

/* --- NEW: Step 1 — Settings & Privacy --- */

function SettingsPrivacyIllustration() {
  return (
    <FbScreen>
      <FbTitle text="Settings & privacy" />
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-1">
        <div className="flex items-center gap-2 bg-[#303236] px-3 py-2 border-b border-[#3E4042]">
          <svg className="w-2.5 h-2.5 text-[#B0B3B8] shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <span className="text-[10px] text-[#B0B3B8]">Search settings</span>
        </div>
      </div>
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-2">
        <div className="bg-[#303236] px-3 py-2 border-b border-[#3E4042]">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-[#B0B3B8]">Meta</span>
            <span className="text-[10px] font-semibold text-[#E4E6EB]">Accounts Center</span>
          </div>
          <p className="text-[8px] text-[#B0B3B8] mt-0.5">Manage your connected experiences</p>
        </div>
        <div className="flex items-center gap-2 bg-[#303236] px-3 py-2 border-b border-[#3E4042]">
          <svg className="w-2.5 h-2.5 text-[#B0B3B8] shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
          <span className="text-[10px] text-[#E4E6EB]">Personal details</span>
        </div>
        <div className="flex items-center gap-2 bg-[#303236] px-3 py-2 border-b border-[#3E4042]">
          <svg className="w-2.5 h-2.5 text-[#B0B3B8] shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-[10px] text-[#E4E6EB]">Password and security</span>
        </div>
        <div className="bg-[#303236] px-3 py-2">
          <span className="text-[10px] text-[#4599FF]">See more in Accounts Center</span>
        </div>
      </div>
    </FbScreen>
  );
}

/* --- NEW: Step 2 — Accounts Center --- */

function AccountsCenterIllustration() {
  return (
    <FbScreen>
      <FbTitle text="Accounts Center" />
      <FbDesc>Manage your connected experiences and account settings across Meta technologies.</FbDesc>
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-2">
        <OptionRow label="Profiles" />
        <OptionRow label="Password and security" />
        <OptionRow label="Your information and permissions" highlight />
        <OptionRow label="Ad preferences" last />
      </div>
    </FbScreen>
  );
}

/* --- NEW: Step 3 — Your information and permissions --- */

function YourInfoIllustration() {
  return (
    <FbScreen>
      <FbSubheader text="Accounts Center" />
      <FbTitle text="Your information and permissions" />
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-1">
        <OptionRow label="Access your information" />
        <OptionRow label="Export your information" highlight />
        <OptionRow label="Search history" last />
      </div>
    </FbScreen>
  );
}

/* --- Existing illustrations (renumbered) --- */

function ExportToDeviceIllustration() {
  return (
    <FbScreen>
      <FbSubheader text="Your Name · Facebook" />
      <FbTitle text="Choose where to export" />
      <FbDesc>You can export info to your device or to an external service.</FbDesc>
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-1">
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2.5 border-[1.5px] border-[#4599FF] rounded-t-lg">
          <span className="text-[11px] text-white font-medium">Export to device</span>
          <ChevronRight />
        </div>
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2.5 border-t border-[#3E4042]">
          <span className="text-[11px] text-[#E4E6EB]">Export to external service</span>
          <ChevronRight />
        </div>
      </div>
    </FbScreen>
  );
}

function FormatIllustration() {
  return (
    <FbScreen>
      <FbSubheader text="Your Name · Facebook" />
      <FbTitle text="Format" />
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-1">
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2.5 border-b border-[#3E4042]">
          <div>
            <p className="text-[11px] text-[#E4E6EB]">HTML</p>
            <p className="text-[8px] text-[#B0B3B8] mt-0.5">View your data offline on your computer.</p>
          </div>
          <RadioOff />
        </div>
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2.5">
          <div>
            <p className="text-[11px] text-white font-medium">JSON</p>
            <p className="text-[8px] text-[#B0B3B8] mt-0.5">Import your data into another site or app.</p>
          </div>
          <RadioOn />
        </div>
      </div>
      <FbButton text="Save" />
    </FbScreen>
  );
}

function DateRangeIllustration() {
  return (
    <FbScreen>
      <FbSubheader text="Your Name · Facebook" />
      <FbTitle text="Date range" />
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-1">
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2 border-b border-[#3E4042]">
          <span className="text-[11px] text-[#E4E6EB]">Last year</span>
          <RadioOff />
        </div>
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2 border-b border-[#3E4042]">
          <span className="text-[11px] text-[#E4E6EB]">Last 3 years</span>
          <RadioOff />
        </div>
        <div className="flex items-center justify-between bg-[#263354] px-3 py-2 border-b border-[#3E4042]">
          <div>
            <p className="text-[11px] text-white font-medium">All time</p>
            <p className="text-[8px] text-[#B0B3B8]">May take longer to export</p>
          </div>
          <RadioOn />
        </div>
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2">
          <span className="text-[11px] text-[#E4E6EB]">Custom</span>
          <RadioOff />
        </div>
      </div>
      <FbButton text="Save" />
    </FbScreen>
  );
}

function QualityIllustration() {
  return (
    <FbScreen>
      <FbSubheader text="Your Name · Facebook" />
      <FbTitle text="Media quality" />
      <FbDesc>Higher quality looks better but takes more space.</FbDesc>
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-1">
        <div className="flex items-center justify-between bg-[#263354] px-3 py-2.5 border-b border-[#3E4042]">
          <span className="text-[11px] text-white font-medium">Higher quality</span>
          <RadioOn />
        </div>
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2.5 border-b border-[#3E4042]">
          <span className="text-[11px] text-[#E4E6EB]">Medium quality</span>
          <RadioOff />
        </div>
        <div className="flex items-center justify-between bg-[#303236] px-3 py-2.5">
          <span className="text-[11px] text-[#E4E6EB]">Lower quality</span>
          <RadioOff />
        </div>
      </div>
      <FbButton text="Save" />
    </FbScreen>
  );
}

function StartExportIllustration() {
  return (
    <FbScreen>
      <FbSubheader text="Confirm your export" />
      <FbDesc>When ready, we'll send you a notification. You have 4 days to download.</FbDesc>
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-1">
        <SettingsRow icon="cal" label="Date range" value="All time" />
        <SettingsRow icon="doc" label="Format" value="JSON" />
        <SettingsRow icon="img" label="Media quality" value="Higher quality" />
      </div>
      <FbButton text="Start export" />
    </FbScreen>
  );
}

function ImportIllustration() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-14 h-14 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center">
        <svg className="w-7 h-7 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
      </div>
      <span className="text-[11px] text-gray-400 font-mono">facebook-yourname.zip</span>
      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      <div className="flex items-center gap-1.5">
        <div className="w-7 h-7 bg-black rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-sm">K</span>
        </div>
        <span className="text-[12px] font-semibold text-[#1877F2]">Kizu</span>
      </div>
    </div>
  );
}

/* --- Reusable sub-components --- */

function OptionRow({ label, highlight, last }: { label: string; highlight?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between bg-[#303236] px-3 py-2.5 ${!last ? 'border-b border-[#3E4042]' : ''} ${highlight ? 'bg-[#263354]' : ''}`}>
      <span className={`text-[11px] ${highlight ? 'text-white font-medium' : 'text-[#E4E6EB]'}`}>{label}</span>
      <ChevronRight />
    </div>
  );
}

function SettingsRow({ icon, label, value, highlight }: {
  icon: string; label: string; value: string; highlight?: boolean;
}) {
  const iconMap: Record<string, React.ReactNode> = {
    cal: <svg className="w-3 h-3 text-[#B0B3B8] shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>,
    doc: <svg className="w-3 h-3 text-[#B0B3B8] shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>,
    img: <svg className="w-3 h-3 text-[#B0B3B8] shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>,
  };
  return (
    <div className="flex items-center gap-2 bg-[#303236] px-3 py-2 border-b border-[#3E4042] last:border-b-0">
      {iconMap[icon]}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-[#E4E6EB]">{label}</p>
        <p className={`text-[9px] mt-0.5 ${highlight ? 'text-[#4599FF]' : 'text-[#B0B3B8]'}`}>{value}</p>
      </div>
      <ChevronRight />
    </div>
  );
}
