import React from 'react';

interface StepCardProps {
  number: number;
  title: string;
  description: string;
  illustration: React.ReactNode;
  tip?: string;
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

export function FacebookImportGuide() {
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="text-center mb-2">
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
      </div>

      <StepCard
        number={1}
        title="Go to Download your information"
        description={'On Facebook, go to:\nSettings & Privacy > Settings > Your Facebook Information > Download your information'}
        illustration={<DownloadInfoIllustration />}
        tip="You can search 'Download your information' in Facebook's search bar"
      />

      <StepCard
        number={2}
        title='Select "Export to device"'
        description="Choose to export the data to your device so you can pick it up as a ZIP file."
        illustration={<ExportToDeviceIllustration />}
      />

      <StepCard
        number={3}
        title="Change the export settings"
        description="Before starting the export, tap each setting to change them:"
        illustration={<ConfirmExportIllustration />}
      />

      <StepCard
        number={4}
        title='Change Format to "JSON"'
        description="The default is HTML — you must change it to JSON so Kizu can read your data."
        illustration={<FormatIllustration />}
        tip="JSON lets Kizu import your data. HTML only lets you view it in a browser."
      />

      <StepCard
        number={5}
        title='Set Date range to "All time"'
        description="Select All time to get your complete Facebook history, or choose a custom range."
        illustration={<DateRangeIllustration />}
      />

      <StepCard
        number={6}
        title='Set Media quality to "Higher quality"'
        description="This ensures your photos and videos are imported at the best resolution."
        illustration={<QualityIllustration />}
      />

      <StepCard
        number={7}
        title='Click "Start export" and wait'
        description={"Facebook will prepare your file and notify you when it's ready. This can take minutes to hours.\n\nYou have 4 days to download it once it's ready."}
        illustration={<StartExportIllustration />}
        tip="Save the ZIP somewhere easy to find, like your Desktop or Downloads folder"
      />

      <StepCard
        number={8}
        title="Select the file in Kizu"
        description="Click the button below to pick your Facebook export ZIP. Kizu will read it, show you a summary, and start importing."
        illustration={<ImportIllustration />}
      />
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

/* --- Screen illustrations --- */

function DownloadInfoIllustration() {
  return (
    <FbScreen>
      <div className="flex items-center justify-between mb-2">
        <svg className="w-3 h-3 text-[#E4E6EB]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
        <svg className="w-3 h-3 text-[#E4E6EB]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
      <FbSubheader text="Your Name · Facebook" />
      <FbTitle text="Download your information" />
      <FbButton text="Request a download" />
    </FbScreen>
  );
}

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

function ConfirmExportIllustration() {
  return (
    <FbScreen>
      <FbSubheader text="Confirm your export" />
      <FbDesc>Change these before starting:</FbDesc>
      <div className="rounded-lg overflow-hidden border border-[#3E4042] mt-1">
        <SettingsRow icon="cal" label="Date range" value="All time" highlight />
        <SettingsRow icon="doc" label="Format" value="JSON" highlight />
        <SettingsRow icon="img" label="Media quality" value="Higher quality" highlight />
      </div>
      <FbButton text="Start export" />
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

/* --- Reusable sub-component --- */

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
