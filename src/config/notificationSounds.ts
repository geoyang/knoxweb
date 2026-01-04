/**
 * Notification Sounds Configuration
 *
 * These sounds can be assigned to contacts for personalized push notification alerts.
 *
 * SETUP REQUIRED:
 *
 * iOS: Add sound files to ios/Knox/Sounds/ (CAF, AIFF, or WAV format, max 30 seconds)
 *      Then add them to the Xcode project under "Copy Bundle Resources"
 *
 * Android: Add sound files to android/app/src/main/res/raw/ (MP3, OGG, or WAV format)
 *          Use lowercase filenames with underscores (e.g., gentle_chime.mp3)
 */

export interface NotificationSound {
  id: string;
  name: string;
  description: string;
  // Filename without extension - iOS uses .caf/.aiff, Android uses .mp3/.ogg
  filename: string;
  // Category for organizing in UI
  category: 'gentle' | 'classic' | 'playful' | 'nature' | 'musical' | 'drama';
  // Preview icon (FontAwesome icon name)
  icon: string;
}

// Default sound - a pleasant chord progression
export const DEFAULT_SOUND: NotificationSound = {
  id: 'default',
  name: 'Zip',
  description: 'A quick zip sound',
  filename: 'harmony_chord',
  category: 'gentle',
  icon: 'superpowers',
};

// 10 diverse notification sounds
export const NOTIFICATION_SOUNDS: NotificationSound[] = [
  DEFAULT_SOUND,
  {
    id: 'drama',
    name: 'Drama',
    description: 'A Dramatic Intro',
    filename: 'drama',
    category: 'playful',
    icon: 'bolt',
  },
  {
    id: 'crystal_chime',
    name: 'Crystal Chime',
    description: 'Sparkling crystal wind chimes',
    filename: 'crystal_chime',
    category: 'gentle',
    icon: 'diamond',
  },
  {
    id: 'quick_smack',
    name: 'Quick Smack',
    description: 'Quick smacking',
    filename: 'quick_smack',
    category: 'playful',
    icon: 'th-large',
  },
  {
    id: 'gasp',
    name: 'Gasp',
    description: 'Woman Gasping',
    filename: 'gasp',
    category: 'playful',
    icon: 'exclamation-circle',
  },
  {
    id: 'coming',
    name: 'Anticipation',
    description: 'Dramatic anticipation sound',
    filename: 'movie',
    category: 'nature',
    icon: 'film',
  },
  {
    id: 'Swoosh',
    name: 'Swoosh',
    description: 'A quick swooshing sound',
    filename: 'swoosh',
    category: 'nature',
    icon: 'snapchat-ghost',
  },
  {
    id: 'sad_sound',
    name: 'Sad Sound',
    description: 'When you lose a game',
    filename: 'sad',
    category: 'playful',
    icon: 'frown-o',
  },
  {
    id: 'action_sound',
    name: 'Action',
    description: 'Action sound',
    filename: 'action',
    category: 'playful',
    icon: 'hand-rock-o',
  },
  {
    id: 'woosh',
    name: 'woosh',
    description: 'Wooshing sound effect',
    filename: 'woosh',
    category: 'classic',
    icon: 'fighter-jet',
  },
  {
    id: 'sneeze',
    name: 'Sneeze',
    description: 'Sneeze',
    filename: 'sneeze',
    category: 'playful',
    icon: 'meh-o',
  },
];

// Get sound by ID
export const getSoundById = (id: string | null | undefined): NotificationSound => {
  if (!id) return DEFAULT_SOUND;
  return NOTIFICATION_SOUNDS.find(s => s.id === id) || DEFAULT_SOUND;
};

// Get sounds by category
export const getSoundsByCategory = (category: NotificationSound['category']): NotificationSound[] => {
  return NOTIFICATION_SOUNDS.filter(s => s.category === category);
};

// Get all categories with their sounds
export const SOUND_CATEGORIES = [
  { id: 'gentle', name: 'Gentle', icon: 'leaf' },
  { id: 'musical', name: 'Musical', icon: 'music' },
  { id: 'nature', name: 'Nature', icon: 'tree' },
  { id: 'playful', name: 'Playful', icon: 'smile-o' },
  { id: 'classic', name: 'Classic', icon: 'bell-o' },
] as const;

// Get the platform-specific filename for FCM
export const getPlatformSoundFilename = (soundId: string | null | undefined, platform: 'ios' | 'android'): string => {
  if (!soundId || soundId === 'default') {
    return 'default'; // Use system default
  }

  const sound = getSoundById(soundId);

  if (platform === 'ios') {
    // iOS expects the sound file name with extension in the app bundle
    return `${sound.filename}.caf`;
  } else {
    // Android expects just the resource name (no extension, no path)
    return sound.filename;
  }
};
