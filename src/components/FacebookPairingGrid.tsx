import React, { useMemo } from 'react';
import type { ParsedAsset } from '../lib/facebookParser';

interface Props {
  assets: ParsedAsset[];
  backSidePairs: Map<number, number>;
  pairingSelection: number[];
  onTap: (index: number) => void;
  onUnpair: (frontIndex: number) => void;
  onDone: () => void;
}

export function FacebookPairingGrid({
  assets, backSidePairs, pairingSelection, onTap, onUnpair, onDone,
}: Props) {
  const photos = useMemo(() => {
    const list: { asset: ParsedAsset; realIndex: number; url: string }[] = [];
    for (let i = 0; i < assets.length; i++) {
      if (assets[i].mediaType === 'photo') {
        list.push({ asset: assets[i], realIndex: i, url: URL.createObjectURL(assets[i].file) });
      }
    }
    return list;
  }, [assets]);

  const backIndexes = useMemo(() => new Set(backSidePairs.values()), [backSidePairs]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {pairingSelection.length === 0
            ? 'Tap a photo to select the FRONT, then tap another for the BACK.'
            : `Front selected: "${assets[pairingSelection[0]]?.filename}". Now tap the BACK.`}
        </p>
        <button onClick={onDone} className="text-xs font-semibold text-red-500 shrink-0 ml-2">
          Done
        </button>
      </div>

      {/* Existing pairs */}
      {backSidePairs.size > 0 && (
        <div className="space-y-2">
          {Array.from(backSidePairs.entries()).map(([frontIdx, backIdx]) => (
            <PairRow
              key={`${frontIdx}-${backIdx}`}
              front={assets[frontIdx]}
              back={assets[backIdx]}
              onUnpair={() => onUnpair(frontIdx)}
            />
          ))}
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-5 gap-1 max-h-64 overflow-y-auto rounded-lg">
        {photos.map(({ asset, realIndex, url }) => {
          const isSelected = pairingSelection.includes(realIndex);
          const isFront = backSidePairs.has(realIndex);
          const isBack = backIndexes.has(realIndex);
          const isPaired = isFront || isBack;
          return (
            <button
              key={realIndex}
              onClick={() => onTap(realIndex)}
              className={`relative aspect-square rounded overflow-hidden border-2 transition ${
                isSelected ? 'border-[#1877F2] ring-2 ring-[#1877F2]/40' :
                isPaired ? 'border-gray-300 opacity-50' : 'border-transparent hover:border-gray-200'
              }`}
              disabled={isPaired}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              {isFront && <Badge label="F" color="bg-blue-500" />}
              {isBack && <Badge label="B" color="bg-green-500" />}
              {isSelected && <Badge label="F" color="bg-[#1877F2]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PairRow({ front, back, onUnpair }: {
  front: ParsedAsset; back: ParsedAsset; onUnpair: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
      <Thumb file={front.file} />
      <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
      <Thumb file={back.file} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{front.filename}</p>
        <p className="text-[10px] text-gray-400">front / back</p>
      </div>
      <button onClick={onUnpair} className="text-red-400 hover:text-red-600 p-1">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

function Thumb({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  return <img src={url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`absolute top-0.5 left-0.5 ${color} text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center`}>
      {label}
    </span>
  );
}
