export type FileType =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "code"

export interface FileNode {
  id: string
  name: string
  type: FileType
  ext?: string
  size: string
  sizeBytes: number
  modified: string
  created: string
  items?: number
  starred?: boolean
  tags?: string[]
  parent?: string
}

export const sidebarTree: { id: string; name: string }[] = [
  { id: "movies", name: "Movies" },
  { id: "pictures", name: "Pictures" },
  { id: "concepts", name: "Concepts" },
  { id: "articles", name: "Articles I'll never finish" },
  { id: "redesign", name: "Website redesign v5" },
  { id: "invoices", name: "Invoices" },
]

export const files: FileNode[] = [
  {
    id: "movies",
    name: "Movies",
    type: "folder",
    size: "360 GB",
    sizeBytes: 360 * 1024 ** 3,
    modified: "Jan 13, 2026  3:11 PM",
    created: "Dec 04, 2008",
    items: 25,
    starred: true,
    tags: ["media", "personal"],
  },
  {
    id: "pictures",
    name: "Pictures",
    type: "folder",
    size: "25 MB",
    sizeBytes: 25 * 1024 ** 2,
    modified: "Jan 13, 2026  3:11 PM",
    created: "Mar 17, 2014",
    items: 412,
    tags: ["media"],
  },
  {
    id: "concepts",
    name: "Concepts",
    type: "folder",
    size: "0 KB",
    sizeBytes: 0,
    modified: "Jan 13, 2026  3:11 PM",
    created: "Jul 02, 2022",
    items: 0,
    tags: ["work"],
  },
  {
    id: "articles",
    name: "Articles I'll never finish",
    type: "folder",
    size: "12 GB",
    sizeBytes: 12 * 1024 ** 3,
    modified: "Jan 13, 2026  3:11 PM",
    created: "Sep 11, 2019",
    items: 38,
    starred: true,
    tags: ["writing"],
  },
  {
    id: "redesign",
    name: "Website redesign v5",
    type: "folder",
    size: "169 MB",
    sizeBytes: 169 * 1024 ** 2,
    modified: "Jan 13, 2026  3:11 PM",
    created: "Feb 04, 2024",
    items: 84,
    tags: ["work", "design"],
  },
  {
    id: "invoices",
    name: "Invoices",
    type: "folder",
    size: "12 MB",
    sizeBytes: 12 * 1024 ** 2,
    modified: "Jan 13, 2026  3:11 PM",
    created: "Jan 01, 2020",
    items: 56,
    tags: ["finance"],
  },
  {
    id: "ed-profile",
    name: "Ed's profile pic",
    type: "image",
    ext: "PNG",
    size: "120 MB",
    sizeBytes: 120 * 1024 ** 2,
    modified: "Jan 13, 2026  3:11 PM",
    created: "Apr 22, 2023",
    tags: ["avatar"],
  },
  {
    id: "gta-codes",
    name: "GTA V Cheat codes",
    type: "document",
    ext: "DOCX",
    size: "5 KB",
    sizeBytes: 5 * 1024,
    modified: "Jan 13, 2026  3:11 PM",
    created: "Aug 09, 2017",
    starred: true,
    tags: ["fun"],
  },
  {
    id: "track-01",
    name: "Late night demo.wav",
    type: "audio",
    ext: "WAV",
    size: "84 MB",
    sizeBytes: 84 * 1024 ** 2,
    modified: "Jan 12, 2026  9:42 PM",
    created: "Jan 12, 2026",
    tags: ["music"],
  },
  {
    id: "archive-01",
    name: "Backups 2025.zip",
    type: "archive",
    ext: "ZIP",
    size: "2.4 GB",
    sizeBytes: 2.4 * 1024 ** 3,
    modified: "Jan 02, 2026  6:00 AM",
    created: "Jan 02, 2026",
    tags: ["backup"],
  },
  {
    id: "code-01",
    name: "vault-storage.tar",
    type: "code",
    ext: "TAR",
    size: "11 MB",
    sizeBytes: 11 * 1024 ** 2,
    modified: "Jan 09, 2026  4:21 PM",
    created: "Jan 09, 2026",
    tags: ["code", "work"],
  },
]

export function fileTypeLabel(file: FileNode): string {
  if (file.type === "folder") return "Folder"
  if (file.ext) {
    const map: Record<string, string> = {
      PNG: "PNG image",
      JPG: "JPEG image",
      DOCX: "Word document",
      WAV: "Audio",
      MP3: "Audio",
      ZIP: "Archive",
      TAR: "Archive",
    }
    return map[file.ext] ?? file.ext
  }
  return "File"
}
