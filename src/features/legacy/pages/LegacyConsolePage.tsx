/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-nocheck
import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import { 
  BarChart3, 
  BookOpen, 
  ChevronDown,
  ChevronUp,
  ChevronRight, 
  Database, 
  FileText, 
  Github, 
  Layout, 
  MessageSquare, 
  Network, 
  Plus, 
  Rocket, 
  Search, 
  Settings, 
  Users, 
  Workflow, 
  ShieldCheck, 
  Cpu, 
  FileBox, 
  Component,
  Menu,
  X,
  Bell,
  User,
  MoreVertical,
  Filter,
  Star,
  Tag,
  Clock,
  Edit,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Image,
  Video,
  File,
  Copy,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Upload,
  Download,
  Globe,
  Code,
  Type,
  Check,
  Wand2,
  Sparkles,
  Scissors,
  Hash,
  Regex,
  FileStack,
  Divide,
  Eye,
  RotateCcw,
  Lock,
  AlertTriangle,
  Pause,
  Play,
  RotateCw,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DEFAULT_AUTH_PASSWORD,
  PASSWORD_RULE_TEXT,
  clearAuthSession,
  getUserPassword,
  isValidSixDigitPassword,
  removeAuthUser,
  setUserPassword,
  upsertAuthUser
} from '@/features/auth/authStorage';
import {
  analyzeKnowledgeImage,
  getImageChunkTypeLabel,
  inferImageFileKind,
  isSemanticImageChunk,
  type ImageAnalysisResult,
  type ImageKnowledgeChunk
} from '@/features/legacy/services/imageSliceAdapter';
import { recognizeImageText, type ImageOcrResult } from '@/features/legacy/services/imageOcrAdapter';
import { recognizeImageVisualContent, type ImageVisionLabel, type ImageVisionResult } from '@/features/legacy/services/imageVisionAdapter';
import { transcribeAudioFile, type AudioTranscriptSegment, type AudioTranscriptionResult } from '@/features/legacy/services/audioTranscriptionAdapter';
import { readUploadDocumentText } from '@/features/legacy/services/documentTextAdapter';
import {SkillCenterPage} from '@/features/skills/pages/SkillCenterPage';

// Types
interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  type: 'PDF' | 'Website' | 'Text' | 'Files';
  category: '通用知识库' | '技术文档' | 'FAQ' | '自定义'; // 新增：知识库类型
  permissionType: '公开知识库' | '私有知识库' | '部分公开'; // 新增：权限类型
  embeddingModel: string; // 新增：索引配置的大模型
  vectorStorage: string; // 新增：向量库存储方式
  status: 'Ready' | 'Processing' | 'Error';
  docsCount: number;
  lastModified: string;
  creator: string;
  modifier: string;
  tags: string[];
  isFavorited: boolean;
  documentTypes: { type: string; count: number }[];
  documents: Document[]; // 新增：每个知识库有自己的文档列表
}

interface Document {
  id: string;
  name: string;
  tags: string[];
  charCount: number;
  chunkCount?: number; // 新增：段落数
  fileSize?: string; // 新增：文件大小
  callCount?: number; // 新增：调用次数
  format: string;
  status: 'Queued' | 'Parsing' | 'Chunking' | 'Embedding' | 'Ready' | 'Failed' | 'Disabled'; // 完整的状态系统
  failureReason?: string; // 新增：失败原因
  lastEdited: string;
  addedBy: string;
  enabled: boolean;
  fileId?: string; // 新增：文件ID
  summary?: string; // 新增：概述
  sourceType?: 'text' | 'table' | 'web' | 'image' | 'audio';
  previewUrl?: string;
  content?: string;
  chunks?: Array<{
    id: string;
    content: string;
    type?: string;
    sourceImage?: string;
    chunkType?: string;
    bbox?: { x: number; y: number; width: number; height: number };
    rowIndex?: number;
    colIndex?: number;
    parentId?: string;
    referenceId?: string;
    tableMarkdown?: string;
    metadata?: Record<string, string | number | boolean>;
  }>;
  sliceRule?: string;
  ocrStatus?: ImageOcrResult['status'];
  ocrText?: string;
  ocrConfidence?: number;
  ocrMessage?: string;
  imageVisionStatus?: ImageVisionResult['status'];
  imageVisionLabels?: ImageVisionLabel[];
  imageVisionCaption?: string;
  imageVisionMessage?: string;
  imageVisionProvider?: ImageVisionResult['provider'];
  asrStatus?: AudioTranscriptionResult['status'];
  asrText?: string;
  asrSegments?: AudioTranscriptSegment[];
  asrMessage?: string;
  asrProvider?: AudioTranscriptionResult['provider'];
}

type AppModule = 'knowledge' | 'skill' | 'permission';
type PermissionSection = 'users' | 'roles' | 'departments';

interface SkillTemplate {
  id: string;
  name: string;
  type: string;
  target: string;
  input: string;
  output: string;
  enabled: boolean;
  usageCount: number;
  successRate: string;
  version: string;
}

interface PermissionUser {
  id: string;
  name: string;
  account: string;
  avatar: string;
  phone: string;
  email: string;
  department: string;
  role: string;
  status: '在职' | '已禁用';
  lastLogin: string;
}

interface PermissionRole {
  id: string;
  name: string;
  type: '预置' | '自定义';
  description: string;
  userCount: number;
  createdAt: string;
  permissions: Record<string, string[]>;
}

interface PermissionDepartment {
  id: string;
  name: string;
  owner: string;
  memberCount: number;
  memberIds: string[];
  children?: PermissionDepartment[];
}

type DocumentStatus = Document['status'];

const MAX_AUTO_FILE_TAGS = 3;

const getDemoDocumentStatus = (index: number): DocumentStatus => {
  const statuses: DocumentStatus[] = ['Queued', 'Parsing', 'Chunking', 'Embedding', 'Ready', 'Failed', 'Disabled'];
  return statuses[index % statuses.length];
};

const getSecurityManualStatus = (index: number): DocumentStatus => {
  const statuses: DocumentStatus[] = ['Ready', 'Embedding', 'Queued'];
  return statuses[index % statuses.length];
};

// 合并后的状态枚举：排队中 / 处理中 / 可用 / 失败 / 已禁用
type MergedDocStatus = 'Queued' | 'Processing' | 'Ready' | 'Failed' | 'Disabled';

const getMergedDocStatus = (doc: Pick<Document, 'status' | 'enabled'>): MergedDocStatus => {
  if (doc.status === 'Failed') return 'Failed';
  if (doc.status === 'Queued') return 'Queued';
  if (doc.status === 'Parsing' || doc.status === 'Chunking' || doc.status === 'Embedding') return 'Processing';
  if (doc.status === 'Disabled') return 'Disabled';
  // Ready：根据 enabled 区分 可用 / 已禁用
  return doc.enabled ? 'Ready' : 'Disabled';
};

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

// Toast组件 - 蓝色风格设计
const ToastContainer = ({ toasts, onRemove }: { toasts: Toast[], onRemove: (id: string) => void }) => {
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="min-w-[340px] max-w-[420px] px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm flex items-center gap-3 border bg-blue-50/95 border-blue-200"
          >
            {/* 图标 */}
            <div className="flex-shrink-0">
              {toast.type === 'success' && (
                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
                </div>
              )}
              {toast.type === 'error' && (
                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <X className="w-3 h-3 text-white" strokeWidth={2.5} />
                </div>
              )}
              {toast.type === 'warning' && (
                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
              )}
              {toast.type === 'info' && (
                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">i</span>
                </div>
              )}
            </div>
            
            {/* 消息文本 */}
            <span className="flex-1 text-sm font-medium text-blue-800">{toast.message}</span>
            
            {/* 关闭按钮 */}
            <button
              onClick={() => onRemove(toast.id)}
              className="flex-shrink-0 text-blue-400 hover:text-blue-600 transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const INITIAL_KNOWLEDGE_BASES: KnowledgeBase[] = [
  {
    id: '1',
    name: '产品设计规范 2024',
    description: 'UniAction 核心视觉与交互设计规范文档，包含完整的设计系统、组件库使用指南、品牌视觉规范、交互设计原则以及可访问性标准。本文档旨在帮助设计师和开发者保持产品设计的一致性和专业性，提升用户体验质量。',
    type: 'PDF',
    category: '技术文档',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-small',
    vectorStorage: '默认存储',
    status: 'Ready',
    docsCount: 12,
    lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '海洋饼干',
    modifier: '张设计师',
    tags: ['设计', '规范', '产品'],
    isFavorited: true,
    documentTypes: [
      { type: 'PDF', count: 8 },
      { type: 'PNG', count: 4 }
    ],
    documents: [
      { id: '1-1', name: '内部规范.pdf', tags: ['规范', '制度'], charCount: 1990, format: 'PDF', status: 'Ready', lastEdited: '2026-05-15 10:30', addedBy: '里斯', enabled: true, fileId: 'b7a0b7223-1ee2-49d0ca144-d312a33b3d40', summary: '一份详细的内部规范文档，涵盖了公司的各项制度和流程要求。' },
      { id: '1-2', name: '功能手册.pdf', tags: ['产品'], charCount: 500, format: 'PDF', status: 'Embedding', lastEdited: '2026-05-10 14:20', addedBy: '张三', enabled: true, fileId: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6', summary: '产品功能使用手册，帮助用户快速上手使用产品的各项功能。' },
      { id: '1-3', name: '设计指南.pdf', tags: ['设计'], charCount: 2200, format: 'PDF', status: 'Chunking', lastEdited: '2026-05-05 09:15', addedBy: '李设计', enabled: true, fileId: '9642b117-3058-47a3-b0cc-818f9e4d2a1b', summary: '设计规范指南，包含UI设计、交互设计等多方面的设计标准和最佳实践。' },
      { id: '1-4', name: '交互规范.pdf', tags: ['规范'], charCount: 1800, format: 'PDF', status: 'Queued', lastEdited: '2026-04-28 16:45', addedBy: '王交互', enabled: true },
      { id: '1-5', name: '视觉规范.pdf', tags: ['设计', '规范'], charCount: 2100, format: 'PDF', status: 'Parsing', lastEdited: '2026-04-20 11:30', addedBy: '赵视觉', enabled: true },
      { id: '1-6', name: '组件库文档.pdf', tags: ['产品'], charCount: 3200, format: 'PDF', status: 'Failed', lastEdited: '2026-04-15 08:00', addedBy: '钱组件', enabled: true },
      { id: '1-7', name: '品牌指南.pdf', tags: ['品牌'], charCount: 1500, format: 'PDF', status: 'Disabled', lastEdited: '2026-04-08 14:20', addedBy: '孙品牌', enabled: false },
      { id: '1-8', name: '设计原则.pdf', tags: ['设计'], charCount: 1200, format: 'PDF', status: 'Ready', lastEdited: '2026-03-25 10:10', addedBy: '周原则', enabled: true },
      { id: '1-9', name: 'Logo设计.png', tags: ['设计'], charCount: 0, format: 'PNG', status: 'Parsing', lastEdited: '2026-03-18 15:30', addedBy: '吴设计', enabled: true },
      { id: '1-10', name: '配色方案.png', tags: ['设计'], charCount: 0, format: 'PNG', status: 'Chunking', lastEdited: '2026-03-10 09:45', addedBy: '郑配色', enabled: true },
      { id: '1-11', name: '图标库.png', tags: ['设计'], charCount: 0, format: 'PNG', status: 'Embedding', lastEdited: '2026-02-28 13:20', addedBy: '冯图标', enabled: true },
      { id: '1-12', name: '界面示例.png', tags: ['产品'], charCount: 0, format: 'PNG', status: 'Ready', lastEdited: '2026-02-15 11:00', addedBy: '陈界面', enabled: true }
    ]
  },
  {
    id: '2',
    name: '客户支持 QA 库',
    description: '收集了过去三个月的常见客户问题与标准答案，涵盖产品使用、技术支持、账户管理、支付问题等多个方面。每个问题都经过客服团队精心整理和验证，确保答案的准确性和实用性，帮助客服人员快速响应客户需求。',
    type: 'Website',
    category: 'FAQ',
    permissionType: '公开知识库',
    embeddingModel: 'text-embedding-ada-002',
    vectorStorage: 'Milvus',
    status: 'Ready',
    docsCount: 45,
    lastModified: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '系统管理员',
    modifier: '客服主管',
    tags: ['客服', '问答', '支持'],
    isFavorited: false,
    documentTypes: [
      { type: 'HTML', count: 30 },
      { type: 'MD', count: 15 }
    ],
    documents: Array.from({ length: 45 }, (_, i) => ({
      id: `2-${i + 1}`,
      name: i < 30 ? `客户问题${i + 1}.html` : `FAQ文档${i - 29}.md`,
      tags: i % 3 === 0 ? ['常见问题'] : i % 3 === 1 ? ['技术支持'] : ['产品咨询'],
      charCount: Math.floor(Math.random() * 2000) + 500,
      format: i < 30 ? 'HTML' : 'MD',
      status: i % 7 === 0 ? 'Queued' : 
              i % 7 === 1 ? 'Parsing' : 
              i % 7 === 2 ? 'Chunking' : 
              i % 7 === 3 ? 'Embedding' : 
              i % 7 === 4 ? 'Ready' : 
              i % 7 === 5 ? 'Failed' : 
              'Disabled' as const,
      lastEdited: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      }).replace(/\//g, '-'),
      addedBy: '客服' + (i % 5 + 1),
      enabled: i % 7 !== 6
    }))
  },
  {
    id: '3',
    name: '员工入职手册',
    description: '新人入职流程及行政办公指南，详细介绍了公司文化、组织架构、入职手续办理流程、考勤制度、福利待遇、办公设备申请、IT系统使用说明等内容。帮助新员工快速融入团队，了解公司各项规章制度。',
    type: 'Text',
    category: '通用知识库',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-large',
    vectorStorage: 'Pinecone',
    status: 'Processing',
    docsCount: 5,
    lastModified: new Date(Date.now() - 30 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: 'HR 团队',
    modifier: 'HR 经理',
    tags: ['人事', '入职', '流程'],
    isFavorited: true,
    documentTypes: [
      { type: 'DOCX', count: 3 },
      { type: 'TXT', count: 2 }
    ],
    documents: [
      { id: '3-1', name: '入职流程指南.docx', tags: ['入职', '流程'], charCount: 2500, format: 'DOCX', status: 'Parsing', lastEdited: '2026-04-27 14:30', addedBy: 'HR小王', enabled: true },
      { id: '3-2', name: '员工手册.docx', tags: ['制度'], charCount: 3200, format: 'DOCX', status: 'Chunking', lastEdited: '2026-04-27 14:25', addedBy: 'HR小李', enabled: true },
      { id: '3-3', name: '考勤制度.docx', tags: ['制度'], charCount: 1800, format: 'DOCX', status: 'Ready', lastEdited: '2026-04-27 14:20', addedBy: 'HR小张', enabled: true },
      { id: '3-4', name: '办公室规定.txt', tags: ['规定'], charCount: 1200, format: 'TXT', status: 'Queued', lastEdited: '2026-04-27 14:15', addedBy: 'HR小赵', enabled: true },
      { id: '3-5', name: '福利说明.txt', tags: ['福利'], charCount: 900, format: 'TXT', status: 'Embedding', lastEdited: '2026-04-27 14:10', addedBy: 'HR小钱', enabled: true },
      { id: '3-6', name: '入职须知.txt', tags: ['入职'], charCount: 1100, format: 'TXT', status: 'Failed', lastEdited: '2026-04-27 14:05', addedBy: 'HR小孙', enabled: true },
      { id: '3-7', name: '公司文化.docx', tags: ['文化'], charCount: 2800, format: 'DOCX', status: 'Disabled', lastEdited: '2026-04-27 14:00', addedBy: 'HR小周', enabled: false }
    ]
  },
  {
    id: '4',
    name: '开发者文档 (v2.0)',
    description: 'API 接口文档及 SDK 使用指南',
    type: 'Files',
    category: '技术文档',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-small',
    vectorStorage: 'Weaviate',
    status: 'Ready',
    docsCount: 8,
    lastModified: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '海洋饼干',
    modifier: '技术负责人',
    tags: ['开发', 'API', '文档'],
    isFavorited: false,
    documentTypes: [
      { type: 'JSON', count: 4 },
      { type: 'MD', count: 3 },
      { type: 'YAML', count: 1 }
    ],
    documents: [
      { id: '4-1', name: 'api-config.json', tags: ['API', '配置'], charCount: 1500, format: 'JSON', status: 'Ready', lastEdited: '2026-04-20 10:30', addedBy: '开发A', enabled: true },
      { id: '4-2', name: 'endpoints.json', tags: ['API'], charCount: 2200, format: 'JSON', status: 'Embedding', lastEdited: '2026-04-20 10:25', addedBy: '开发B', enabled: true },
      { id: '4-3', name: 'auth-schema.json', tags: ['认证'], charCount: 800, format: 'JSON', status: 'Chunking', lastEdited: '2026-04-20 10:20', addedBy: '开发C', enabled: true },
      { id: '4-4', name: 'response-format.json', tags: ['API'], charCount: 1100, format: 'JSON', status: 'Queued', lastEdited: '2026-04-20 10:15', addedBy: '开发D', enabled: true },
      { id: '4-5', name: 'SDK使用指南.md', tags: ['SDK', '文档'], charCount: 3500, format: 'MD', status: 'Parsing', lastEdited: '2026-04-20 10:10', addedBy: '开发E', enabled: true },
      { id: '4-6', name: '快速开始.md', tags: ['文档'], charCount: 1800, format: 'MD', status: 'Ready', lastEdited: '2026-04-20 10:05', addedBy: '开发F', enabled: true },
      { id: '4-7', name: '常见问题.md', tags: ['FAQ'], charCount: 2400, format: 'MD', status: 'Failed', lastEdited: '2026-04-20 10:00', addedBy: '开发G', enabled: true },
      { id: '4-8', name: 'config.yaml', tags: ['配置'], charCount: 600, format: 'YAML', status: 'Disabled', lastEdited: '2026-04-20 09:55', addedBy: '开发H', enabled: false }
    ]
  },
  {
    id: '5',
    name: '市场营销素材库',
    description: 'Logo、宣传册素材及品牌传播指南',
    type: 'Files',
    category: '通用知识库',
    permissionType: '公开知识库',
    embeddingModel: 'text-embedding-ada-002',
    vectorStorage: 'Qdrant',
    status: 'Ready',
    docsCount: 24,
    lastModified: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '市场部',
    modifier: '品牌经理',
    tags: ['营销', '品牌', '素材'],
    isFavorited: false,
    documentTypes: [
      { type: 'PNG', count: 12 },
      { type: 'JPG', count: 8 },
      { type: 'AI', count: 4 }
    ],
    documents: [
      { id: '5-1', name: '品牌素材1.png', tags: ['品牌', 'Logo'], charCount: 0, format: 'PNG', status: 'Ready', lastEdited: '2026-05-08 10:20', addedBy: '设计师1', enabled: true },
      { id: '5-2', name: '品牌素材2.png', tags: ['宣传'], charCount: 0, format: 'PNG', status: 'Embedding', lastEdited: '2026-04-22 14:35', addedBy: '设计师2', enabled: true },
      { id: '5-3', name: '品牌素材3.png', tags: ['品牌', 'Logo'], charCount: 0, format: 'PNG', status: 'Queued', lastEdited: '2026-04-05 09:10', addedBy: '设计师3', enabled: true },
      { id: '5-4', name: '品牌素材4.png', tags: ['宣传'], charCount: 0, format: 'PNG', status: 'Chunking', lastEdited: '2026-03-18 16:45', addedBy: '设计师1', enabled: true },
      { id: '5-5', name: '品牌素材5.png', tags: ['品牌', 'Logo'], charCount: 0, format: 'PNG', status: 'Parsing', lastEdited: '2026-03-02 11:25', addedBy: '设计师2', enabled: true },
      { id: '5-6', name: '品牌素材6.png', tags: ['宣传'], charCount: 0, format: 'PNG', status: 'Failed', lastEdited: '2026-02-14 08:50', addedBy: '设计师3', enabled: true },
      { id: '5-7', name: '品牌素材7.png', tags: ['品牌', 'Logo'], charCount: 0, format: 'PNG', status: 'Disabled', lastEdited: '2026-01-28 15:30', addedBy: '设计师1', enabled: false },
      { id: '5-8', name: '品牌素材8.png', tags: ['宣传'], charCount: 0, format: 'PNG', status: 'Ready', lastEdited: '2026-01-10 10:15', addedBy: '设计师2', enabled: true },
      { id: '5-9', name: '品牌素材9.png', tags: ['品牌', 'Logo'], charCount: 0, format: 'PNG', status: 'Embedding', lastEdited: '2025-12-20 13:40', addedBy: '设计师3', enabled: true },
      { id: '5-10', name: '品牌素材10.png', tags: ['宣传'], charCount: 0, format: 'PNG', status: 'Queued', lastEdited: '2025-12-05 09:20', addedBy: '设计师1', enabled: true },
      { id: '5-11', name: '品牌素材11.png', tags: ['品牌', 'Logo'], charCount: 0, format: 'PNG', status: 'Chunking', lastEdited: '2025-11-18 14:55', addedBy: '设计师2', enabled: true },
      { id: '5-12', name: '品牌素材12.png', tags: ['宣传'], charCount: 0, format: 'PNG', status: 'Parsing', lastEdited: '2025-11-02 11:10', addedBy: '设计师3', enabled: true },
      { id: '5-13', name: '产品图1.jpg', tags: ['产品', '营销'], charCount: 0, format: 'JPG', status: 'Ready', lastEdited: '2025-10-15 16:25', addedBy: '摄影师1', enabled: true },
      { id: '5-14', name: '产品图2.jpg', tags: ['产品', '营销'], charCount: 0, format: 'JPG', status: 'Failed', lastEdited: '2025-09-28 10:40', addedBy: '摄影师2', enabled: true },
      { id: '5-15', name: '产品图3.jpg', tags: ['产品', '营销'], charCount: 0, format: 'JPG', status: 'Embedding', lastEdited: '2025-09-10 14:15', addedBy: '摄影师1', enabled: true },
      { id: '5-16', name: '产品图4.jpg', tags: ['产品', '营销'], charCount: 0, format: 'JPG', status: 'Queued', lastEdited: '2025-08-22 09:30', addedBy: '摄影师2', enabled: true },
      { id: '5-17', name: '产品图5.jpg', tags: ['产品', '营销'], charCount: 0, format: 'JPG', status: 'Chunking', lastEdited: '2025-08-05 15:50', addedBy: '摄影师1', enabled: true },
      { id: '5-18', name: '产品图6.jpg', tags: ['产品', '营销'], charCount: 0, format: 'JPG', status: 'Parsing', lastEdited: '2025-07-18 11:20', addedBy: '摄影师2', enabled: true },
      { id: '5-19', name: '产品图7.jpg', tags: ['产品', '营销'], charCount: 0, format: 'JPG', status: 'Disabled', lastEdited: '2025-07-02 08:45', addedBy: '摄影师1', enabled: false },
      { id: '5-20', name: '产品图8.jpg', tags: ['产品', '营销'], charCount: 0, format: 'JPG', status: 'Ready', lastEdited: '2025-06-15 13:10', addedBy: '摄影师2', enabled: true },
      { id: '5-21', name: '矢量图1.ai', tags: ['设计', '矢量'], charCount: 0, format: 'AI', status: 'Embedding', lastEdited: '2025-05-28 10:35', addedBy: '设计总监', enabled: true },
      { id: '5-22', name: '矢量图2.ai', tags: ['设计', '矢量'], charCount: 0, format: 'AI', status: 'Failed', lastEdited: '2025-05-10 14:20', addedBy: '设计总监', enabled: true },
      { id: '5-23', name: '矢量图3.ai', tags: ['设计', '矢量'], charCount: 0, format: 'AI', status: 'Queued', lastEdited: '2025-04-22 09:55', addedBy: '设计总监', enabled: true },
      { id: '5-24', name: '矢量图4.ai', tags: ['设计', '矢量'], charCount: 0, format: 'AI', status: 'Chunking', lastEdited: '2025-04-05 16:40', addedBy: '设计总监', enabled: true }
    ]
  },
  {
    id: '6',
    name: '运维监控文档',
    description: '服务器部署脚本及日常巡检记录',
    type: 'Text',
    category: '技术文档',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-large',
    vectorStorage: '默认存储',
    status: 'Error',
    docsCount: 3,
    lastModified: new Date(Date.now() - 3 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '运维组',
    modifier: '运维工程师',
    tags: ['运维', '监控', '服务器'],
    isFavorited: true,
    documentTypes: [
      { type: 'SH', count: 2 },
      { type: 'LOG', count: 1 }
    ],
    documents: [
      { id: '6-1', name: 'deploy.sh', tags: ['部署', '脚本'], charCount: 1200, format: 'SH', status: 'Failed', lastEdited: '2026-05-09 08:30', addedBy: '运维A', enabled: true },
      { id: '6-2', name: 'monitor.sh', tags: ['监控', '脚本'], charCount: 900, format: 'SH', status: 'Ready', lastEdited: '2026-05-09 08:25', addedBy: '运维B', enabled: true },
      { id: '6-3', name: 'system.log', tags: ['日志'], charCount: 5000, format: 'LOG', status: 'Disabled', lastEdited: '2026-05-09 08:20', addedBy: '系统', enabled: false }
    ]
  },
  {
    id: '7',
    name: '企业文化宣导',
    description: '企业愿景、价值观及发展历程',
    type: 'PDF',
    category: '通用知识库',
    permissionType: '公开知识库',
    embeddingModel: 'text-embedding-ada-002',
    vectorStorage: 'Milvus',
    status: 'Ready',
    docsCount: 1,
    lastModified: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '海洋饼干',
    modifier: 'CEO',
    tags: ['文化', '价值观', '企业'],
    isFavorited: false,
    documentTypes: [
      { type: 'PDF', count: 1 }
    ],
    documents: [
      { id: '7-1', name: '企业文化手册.pdf', tags: ['文化', '价值观'], charCount: 4500, format: 'PDF', status: 'Ready', lastEdited: '2026-05-02 15:00', addedBy: 'CEO', enabled: true },
      { id: '7-2', name: '企业愿景.pdf', tags: ['愿景'], charCount: 2200, format: 'PDF', status: 'Embedding', lastEdited: '2026-05-02 14:55', addedBy: 'CEO', enabled: true },
      { id: '7-3', name: '发展历程.pdf', tags: ['历史'], charCount: 3800, format: 'PDF', status: 'Queued', lastEdited: '2026-05-02 14:50', addedBy: 'CEO', enabled: true },
      { id: '7-4', name: '核心价值观.pdf', tags: ['价值观'], charCount: 1900, format: 'PDF', status: 'Parsing', lastEdited: '2026-05-02 14:45', addedBy: 'CEO', enabled: true },
      { id: '7-5', name: '团队文化.pdf', tags: ['文化'], charCount: 2600, format: 'PDF', status: 'Chunking', lastEdited: '2026-05-02 14:40', addedBy: 'CEO', enabled: true },
      { id: '7-6', name: '使命宣言.pdf', tags: ['使命'], charCount: 1500, format: 'PDF', status: 'Failed', lastEdited: '2026-05-02 14:35', addedBy: 'CEO', enabled: true },
      { id: '7-7', name: '企业精神.pdf', tags: ['精神'], charCount: 1800, format: 'PDF', status: 'Disabled', lastEdited: '2026-05-02 14:30', addedBy: 'CEO', enabled: false }
    ]
  },
  {
    id: '8',
    name: '外部合作伙伴列表',
    description: '对接过的云厂商及第三方服务商信息',
    type: 'Website',
    category: '自定义',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-small',
    vectorStorage: 'Pinecone',
    status: 'Processing',
    docsCount: 15,
    lastModified: new Date(Date.now() - 10 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '商务部',
    modifier: '商务总监',
    tags: ['合作', '伙伴', '商务'],
    isFavorited: false,
    documentTypes: [
      { type: 'CSV', count: 10 },
      { type: 'XLSX', count: 5 }
    ],
    documents: [
      { id: '8-1', name: '合作伙伴1.csv', tags: ['合作', '伙伴'], charCount: 1740, format: 'CSV' as const, status: 'Parsing' as const, lastEdited: '2026-05-10 14:30', addedBy: '商务1', enabled: true },
      { id: '8-2', name: '合作伙伴2.csv', tags: ['合作', '伙伴'], charCount: 1522, format: 'CSV' as const, status: 'Parsing' as const, lastEdited: '2026-04-25 09:15', addedBy: '商务2', enabled: true },
      { id: '8-3', name: '合作伙伴3.csv', tags: ['合作', '伙伴'], charCount: 1846, format: 'CSV' as const, status: 'Ready' as const, lastEdited: '2026-04-08 16:45', addedBy: '商务3', enabled: true },
      { id: '8-4', name: '合作伙伴4.csv', tags: ['合作', '伙伴'], charCount: 1304, format: 'CSV' as const, status: 'Ready' as const, lastEdited: '2026-03-20 11:20', addedBy: '商务1', enabled: true },
      { id: '8-5', name: '合作伙伴5.csv', tags: ['合作', '伙伴'], charCount: 1897, format: 'CSV' as const, status: 'Ready' as const, lastEdited: '2026-03-05 08:30', addedBy: '商务2', enabled: true },
      { id: '8-6', name: '合作伙伴6.csv', tags: ['合作', '伙伴'], charCount: 1310, format: 'CSV' as const, status: 'Ready' as const, lastEdited: '2026-02-18 14:10', addedBy: '商务3', enabled: true },
      { id: '8-7', name: '合作伙伴7.csv', tags: ['合作', '伙伴'], charCount: 1650, format: 'CSV' as const, status: 'Ready' as const, lastEdited: '2026-01-28 10:50', addedBy: '商务1', enabled: true },
      { id: '8-8', name: '合作伙伴8.csv', tags: ['合作', '伙伴'], charCount: 1420, format: 'CSV' as const, status: 'Ready' as const, lastEdited: '2026-01-10 15:25', addedBy: '商务2', enabled: true },
      { id: '8-9', name: '合作伙伴9.csv', tags: ['合作', '伙伴'], charCount: 1580, format: 'CSV' as const, status: 'Ready' as const, lastEdited: '2025-12-22 09:40', addedBy: '商务3', enabled: true },
      { id: '8-10', name: '合作伙伴10.csv', tags: ['合作', '伙伴'], charCount: 1230, format: 'CSV' as const, status: 'Ready' as const, lastEdited: '2025-12-05 13:15', addedBy: '商务1', enabled: true },
      { id: '8-11', name: '服务商信息1.xlsx', tags: ['服务商'], charCount: 1950, format: 'XLSX' as const, status: 'Ready' as const, lastEdited: '2025-11-18 11:30', addedBy: '商务主管', enabled: true },
      { id: '8-12', name: '服务商信息2.xlsx', tags: ['服务商'], charCount: 2100, format: 'XLSX' as const, status: 'Ready' as const, lastEdited: '2025-11-02 16:20', addedBy: '商务主管', enabled: true },
      { id: '8-13', name: '服务商信息3.xlsx', tags: ['服务商'], charCount: 1800, format: 'XLSX' as const, status: 'Ready' as const, lastEdited: '2025-10-15 10:05', addedBy: '商务主管', enabled: true },
      { id: '8-14', name: '服务商信息4.xlsx', tags: ['服务商'], charCount: 2250, format: 'XLSX' as const, status: 'Ready' as const, lastEdited: '2025-09-28 14:45', addedBy: '商务主管', enabled: true },
      { id: '8-15', name: '服务商信息5.xlsx', tags: ['服务商'], charCount: 1680, format: 'XLSX' as const, status: 'Ready' as const, lastEdited: '2025-09-10 08:55', addedBy: '商务主管', enabled: true }
    ]
  },
  {
    id: '9',
    name: '新产品发布 QA 库',
    description: '新产品发布会常见问题及解答汇总',
    type: 'Text',
    category: 'FAQ',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-large',
    vectorStorage: 'Weaviate',
    status: 'Ready',
    docsCount: 28,
    lastModified: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '海洋饼干',
    modifier: '产品经理',
    tags: ['产品', '问答', '发布'],
    isFavorited: true,
    documentTypes: [
      { type: 'DOCX', count: 18 },
      { type: 'PDF', count: 10 }
    ],
    documents: [
      ...Array.from({ length: 18 }, (_, i) => ({
        id: `9-${i + 1}`,
        name: `产品问答${i + 1}.docx`,
        tags: i % 2 === 0 ? ['产品', 'FAQ'] : ['发布会'],
        charCount: Math.floor(Math.random() * 2500) + 1000,
        format: 'DOCX' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 1) * 3 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '产品' + (i % 4 + 1),
        enabled: i % 7 !== 6
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `9-${i + 19}`,
        name: `发布资料${i + 1}.pdf`,
        tags: ['发布', '资料'],
        charCount: Math.floor(Math.random() * 3000) + 1500,
        format: 'PDF' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 19) * 3 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '产品经理',
        enabled: i % 7 !== 6
      }))
    ]
  },
  {
    id: '10',
    name: '技术架构文档',
    description: '系统架构设计及技术选型说明',
    type: 'Files',
    category: '技术文档',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-small',
    vectorStorage: '默认存储',
    status: 'Ready',
    docsCount: 19,
    lastModified: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '技术团队',
    modifier: '架构师',
    tags: ['技术', '架构', '文档'],
    isFavorited: false,
    documentTypes: [
      { type: 'MD', count: 12 },
      { type: 'PNG', count: 7 }
    ],
    documents: [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `10-${i + 1}`,
        name: `架构文档${i + 1}.md`,
        tags: i % 3 === 0 ? ['架构', '设计'] : i % 3 === 1 ? ['技术选型'] : ['系统设计'],
        charCount: Math.floor(Math.random() * 4000) + 2000,
        format: 'MD' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 1) * 8 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '架构师' + (i % 3 + 1),
        enabled: i % 7 !== 6
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `10-${i + 13}`,
        name: `架构图${i + 1}.png`,
        tags: ['架构图', '设计'],
        charCount: 0,
        format: 'PNG' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 13) * 8 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '架构师',
        enabled: i % 7 !== 6
      }))
    ]
  },
  {
    id: '11',
    name: '用户反馈收集',
    description: '用户反馈及改进建议汇总',
    type: 'Website',
    category: 'FAQ',
    permissionType: '公开知识库',
    embeddingModel: 'text-embedding-ada-002',
    vectorStorage: 'Qdrant',
    status: 'Ready',
    docsCount: 67,
    lastModified: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '用户研究',
    modifier: '用户体验',
    tags: ['用户', '反馈', '体验'],
    isFavorited: true,
    documentTypes: [
      { type: 'HTML', count: 45 },
      { type: 'TXT', count: 22 }
    ],
    documents: [
      ...Array.from({ length: 45 }, (_, i) => ({
        id: `11-${i + 1}`,
        name: `用户反馈${i + 1}.html`,
        tags: i % 4 === 0 ? ['反馈', '建议'] : i % 4 === 1 ? ['用户体验'] : i % 4 === 2 ? ['功能需求'] : ['问题报告'],
        charCount: Math.floor(Math.random() * 1500) + 500,
        format: 'HTML' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 1) * 30 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '用户研究' + (i % 5 + 1),
        enabled: i % 7 !== 6
      })),
      ...Array.from({ length: 22 }, (_, i) => ({
        id: `11-${i + 46}`,
        name: `反馈记录${i + 1}.txt`,
        tags: ['反馈', '记录'],
        charCount: Math.floor(Math.random() * 1000) + 300,
        format: 'TXT' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 46) * 30 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '客服',
        enabled: i % 7 !== 6
      }))
    ]
  },
  {
    id: '12',
    name: '法律合规文档',
    description: '公司法律文件及合规要求说明',
    type: 'PDF',
    category: '通用知识库',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-small',
    vectorStorage: 'Milvus',
    status: 'Ready',
    docsCount: 9,
    lastModified: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '法务部',
    modifier: '法务总监',
    tags: ['法律', '合规', '文件'],
    isFavorited: false,
    documentTypes: [
      { type: 'PDF', count: 9 }
    ],
    documents: Array.from({ length: 9 }, (_, i) => ({
      id: `12-${i + 1}`,
      name: `法律文件${i + 1}.pdf`,
      tags: i % 3 === 0 ? ['法律', '合同'] : i % 3 === 1 ? ['合规', '制度'] : ['政策'],
      charCount: Math.floor(Math.random() * 5000) + 3000,
      format: 'PDF' as const,
      status: getDemoDocumentStatus(i),
      lastEdited: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      }).replace(/\//g, '-'),
      addedBy: '法务' + (i % 3 + 1),
      enabled: i % 7 !== 6
    }))
  },
  {
    id: '13',
    name: '数据分析报告',
    description: '业务数据分析及趋势预测报告',
    type: 'Files',
    category: '自定义',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-large',
    vectorStorage: 'Pinecone',
    status: 'Ready',
    docsCount: 34,
    lastModified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '数据团队',
    modifier: '数据分析师',
    tags: ['数据', '分析', '报告'],
    isFavorited: false,
    documentTypes: [
      { type: 'XLSX', count: 20 },
      { type: 'PDF', count: 14 }
    ],
    documents: [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `13-${i + 1}`,
        name: `数据报表${i + 1}.xlsx`,
        tags: i % 2 === 0 ? ['数据', '报表'] : ['分析'],
        charCount: Math.floor(Math.random() * 3000) + 1500,
        format: 'XLSX' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 1) * 4 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '数据分析师' + (i % 4 + 1),
        enabled: i % 7 !== 6
      })),
      ...Array.from({ length: 14 }, (_, i) => ({
        id: `13-${i + 21}`,
        name: `分析报告${i + 1}.pdf`,
        tags: ['报告', '分析'],
        charCount: Math.floor(Math.random() * 4000) + 2500,
        format: 'PDF' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 21) * 4 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '数据总监',
        enabled: i % 7 !== 6
      }))
    ]
  },
  {
    id: '14',
    name: '安全管理手册',
    description: '信息安全管理制度及操作规范',
    type: 'Text',
    category: '技术文档',
    permissionType: '私有知识库',
    embeddingModel: 'text-embedding-3-small',
    vectorStorage: '默认存储',
    status: 'Ready',
    docsCount: 11,
    lastModified: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(/\//g, '-'),
    creator: '安全部',
    modifier: '安全主管',
    tags: ['安全', '管理', '制度'],
    isFavorited: true,
    documentTypes: [
      { type: 'DOCX', count: 8 },
      { type: 'PDF', count: 3 }
    ],
    documents: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `14-${i + 1}`,
        name: `安全制度${i + 1}.docx`,
        tags: i % 2 === 0 ? ['安全', '制度'] : ['管理', '规范'],
        charCount: Math.floor(Math.random() * 3500) + 2000,
        format: 'DOCX' as const,
        status: getDemoDocumentStatus(i),
        lastEdited: new Date(Date.now() - (i + 1) * 18 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '安全专员' + (i % 3 + 1),
        enabled: i % 7 !== 6
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `14-${i + 9}`,
        name: `安全手册${i + 1}.pdf`,
        tags: ['安全', '手册'],
        charCount: Math.floor(Math.random() * 5000) + 3500,
        format: 'PDF' as const,
        status: getSecurityManualStatus(i),
        lastEdited: new Date(Date.now() - (i + 9) * 18 * 60 * 60 * 1000).toLocaleString('zh-CN', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        }).replace(/\//g, '-'),
        addedBy: '安全主管',
        enabled: true
      }))
    ]
  }
];

const INITIAL_SKILL_TEMPLATES: SkillTemplate[] = [
  {
    id: 'skill-001',
    name: '知识摘要生成',
    type: '知识加工',
    target: '文档 / 片段 / 问答 / 知识库',
    input: '文档内容',
    output: '摘要、关键词',
    enabled: true,
    usageCount: 1286,
    successRate: '98.4%',
    version: 'V1.0'
  }
];

const INITIAL_PERMISSION_USERS: PermissionUser[] = [
  {
    id: 'U-1001',
    name: '林清予',
    account: 'lin.qingyu',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lin-qingyu',
    phone: '138-0001-1001',
    email: 'lin.qingyu@example.com',
    department: '技术部门',
    role: '系统管理员',
    status: '在职',
    lastLogin: '2026-06-08 09:18'
  },
  {
    id: 'U-1002',
    name: '陈知远',
    account: 'chen.zhiyuan',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chen-zhiyuan',
    phone: '138-0001-1002',
    email: 'chen.zhiyuan@example.com',
    department: '产品部门',
    role: '知识库管理员',
    status: '在职',
    lastLogin: '2026-06-07 18:42'
  },
  {
    id: 'U-1003',
    name: '周曼宁',
    account: 'zhou.manning',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zhou-manning',
    phone: '138-0001-1003',
    email: 'zhou.manning@example.com',
    department: 'HR部门',
    role: '普通成员',
    status: '已禁用',
    lastLogin: '2026-05-29 14:06'
  },
  {
    id: 'U-1004',
    name: '王一博',
    account: 'wang.yibo',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=wang-yibo',
    phone: '138-0001-1004',
    email: 'wang.yibo@example.com',
    department: '市场部门',
    role: '只读成员',
    status: '在职',
    lastLogin: '2026-04-15 10:21'
  }
];

const INITIAL_PERMISSION_ROLES: PermissionRole[] = [
  {
    id: 'R-001',
    name: '系统管理员',
    type: '预置',
    description: '拥有系统级权限，可管理所有知识库、用户、角色和权限设置。',
    userCount: 3,
    createdAt: '2026-01-01',
    permissions: {
      知识库管理: ['知识库', 'Skill中心', '权限管理']
    }
  },
  {
    id: 'R-002',
    name: '知识库管理员',
    type: '预置',
    description: '可创建知识库，并对其管理的知识库拥有全部操作权限。',
    userCount: 12,
    createdAt: '2026-01-01',
    permissions: {
      知识库管理: ['知识库', 'Skill中心']
    }
  },
  {
    id: 'R-003',
    name: '普通成员',
    type: '预置',
    description: '可查看授权知识库，并新增或编辑自己创建的内容。',
    userCount: 86,
    createdAt: '2026-01-01',
    permissions: {
      知识库管理: ['知识库']
    }
  },
  {
    id: 'R-004',
    name: '只读成员',
    type: '预置',
    description: '仅可查看有权限的知识库及文档。',
    userCount: 24,
    createdAt: '2026-01-01',
    permissions: {
      知识库管理: ['知识库']
    }
  },
  {
    id: 'R-101',
    name: '部门主管',
    type: '自定义',
    description: '管理所属部门成员、部门知识库和团队协作授权。',
    userCount: 8,
    createdAt: '2026-05-18',
    permissions: {
      知识库管理: ['知识库']
    }
  }
];

const INITIAL_PERMISSION_DEPARTMENTS: PermissionDepartment[] = [
  {
    id: 'D-001',
    name: '技术部门',
    owner: '林清予',
    memberCount: 42,
    memberIds: ['U-1001']
  },
  {
    id: 'D-002',
    name: '产品部门',
    owner: '陈知远',
    memberCount: 28,
    memberIds: ['U-1002']
  },
  {
    id: 'D-003',
    name: 'HR部门',
    owner: '周曼宁',
    memberCount: 16,
    memberIds: ['U-1003']
  },
  {
    id: 'D-004',
    name: '市场部门',
    owner: '王一博',
    memberCount: 24,
    memberIds: ['U-1004']
  }
];

const getRoleKnowledgePermissions = (role: PermissionRole): string[] => {
  const preset = INITIAL_PERMISSION_ROLES.find(item => item.name === role.name);
  return role.permissions['知识库管理'] || preset?.permissions['知识库管理'] || [];
};

const ROLE_PERMISSION_GROUPS = [
  { label: '知识库', pages: ['知识库列表页', '知识库详情页'] },
  { label: 'Skill中心', pages: ['Skill模板库', 'Skill执行记录'] },
  { label: '权限管理', pages: ['用户管理', '角色管理', '部门管理'] }
] as const;
const ROLE_PERMISSION_OPTIONS = ROLE_PERMISSION_GROUPS.map(group => group.label);
const SKILL_NAV_ITEMS = [
  { key: 'templates', label: 'Skill 模板库', path: '/skills/templates' },
  { key: 'executions', label: 'Skill 执行记录', path: '/skills/executions' }
] as const;
const UNCONFIGURED_DEPARTMENT = '未配置';

const isUnconfiguredDepartment = (department: string) =>
  department === UNCONFIGURED_DEPARTMENT || department === '未分配' || department === '未归属';

const getDepartmentDisplayName = (department: string) =>
  isUnconfiguredDepartment(department) ? UNCONFIGURED_DEPARTMENT : department;

const getRolePermissionOptionState = (role: PermissionRole): Record<string, boolean> => {
  const permissions = getRoleKnowledgePermissions(role);

  return ROLE_PERMISSION_GROUPS.reduce<Record<string, boolean>>((state, group) => {
    state[group.label] = permissions.includes(group.label) || group.pages.some(page => permissions.includes(page));
    return state;
  }, {});
};

const hasPageLevelPermissions = (permissions: string[]) =>
  ROLE_PERMISSION_GROUPS.some(group => group.pages.some(page => permissions.includes(page)));

function RolePermissionGroupCard({
  group,
  state,
  readOnly,
  onToggleParent,
  onTogglePage
}: {
  group: typeof ROLE_PERMISSION_GROUPS[number];
  state: { parent: boolean; pages: Record<string, boolean> };
  readOnly: boolean;
  onToggleParent: () => void;
  onTogglePage: (page: string) => void;
}) {
  const parentCheckboxRef = useRef<HTMLInputElement>(null);
  const selectedPageCount = group.pages.filter(page => state.pages[page]).length;
  const allPagesSelected = selectedPageCount === group.pages.length;
  const partiallySelected = selectedPageCount > 0 && !allPagesSelected && !state.parent;
  const parentChecked = state.parent || allPagesSelected;

  useEffect(() => {
    if (parentCheckboxRef.current) {
      parentCheckboxRef.current.indeterminate = partiallySelected;
    }
  }, [partiallySelected]);

  return (
    <details
      defaultOpen={parentChecked || partiallySelected}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-3 transition-all hover:bg-blue-50/50 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <input
            ref={parentCheckboxRef}
            type="checkbox"
            checked={parentChecked}
            disabled={readOnly}
            onClick={(event) => event.stopPropagation()}
            onChange={onToggleParent}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-80"
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{group.label}</div>
            <div className="mt-0.5 text-xs text-slate-500">包含 {group.pages.length} 个页面权限</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t border-slate-100 px-4 py-3">
        <div className="mb-2 text-xs font-semibold text-slate-500">页面权限</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {group.pages.map((page) => (
            <label
              key={page}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 ${
                state.parent ? 'bg-blue-50/60' : 'bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(state.pages[page])}
                disabled={readOnly || state.parent}
                onChange={() => onTogglePage(page)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-80"
              />
              {page}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function RolePermissionMatrix({
  role,
  readOnly = false,
  defaultKnowledge = false
}: {
  role?: PermissionRole;
  readOnly?: boolean;
  defaultKnowledge?: boolean;
}) {
  const permissions = role ? getRoleKnowledgePermissions(role) : [];
  const hasExplicitPages = hasPageLevelPermissions(permissions);
  const buildInitialState = () =>
    ROLE_PERMISSION_GROUPS.reduce<Record<string, { parent: boolean; pages: Record<string, boolean> }>>((acc, group) => {
      const parentChecked = role
        ? permissions.includes(group.label)
        : defaultKnowledge && group.label === '知识库';
      acc[group.label] = {
        parent: parentChecked,
        pages: Object.fromEntries(group.pages.map(page => [
          page,
          parentChecked || (role ? permissions.includes(page) || (!hasExplicitPages && permissions.includes(group.label)) : defaultKnowledge && group.label === '知识库')
        ]))
      };
      return acc;
    }, {});
  const [permissionState, setPermissionState] = useState(buildInitialState);

  useEffect(() => {
    setPermissionState(buildInitialState());
  }, [role?.id, readOnly, defaultKnowledge]);

  const toggleParent = (group: typeof ROLE_PERMISSION_GROUPS[number]) => {
    if (readOnly) return;
    setPermissionState(prev => {
      const current = prev[group.label];
      const selectedPageCount = group.pages.filter(page => current.pages[page]).length;
      const allSelected = selectedPageCount === group.pages.length;
      const shouldSelectAll = !(current.parent || allSelected);
      return {
        ...prev,
        [group.label]: {
          parent: shouldSelectAll,
          pages: Object.fromEntries(group.pages.map(page => [page, shouldSelectAll]))
        }
      };
    });
  };

  const togglePage = (group: typeof ROLE_PERMISSION_GROUPS[number], page: string) => {
    if (readOnly) return;
    setPermissionState(prev => {
      const current = prev[group.label];
      if (current.parent) return prev;
      const pages = {...current.pages, [page]: !current.pages[page]};
      const allSelected = group.pages.every(item => pages[item]);
      return {
        ...prev,
        [group.label]: {
          parent: allSelected,
          pages
        }
      };
    });
  };

  const selectedPermissions = ROLE_PERMISSION_GROUPS.flatMap((group) => {
    const state = permissionState[group.label];
    if (!state) return [];
    return [
      ...(state.parent ? [group.label] : []),
      ...group.pages.filter(page => state.pages[page])
    ];
  });

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-900">
        权限 <span className="text-red-500">*</span>
      </div>
      {selectedPermissions.map(permission => (
        <input key={permission} type="hidden" name="knowledgePermissions" value={permission} />
      ))}
      <div className="space-y-3">
        {ROLE_PERMISSION_GROUPS.map((group) => (
          <RolePermissionGroupCard
            key={group.label}
            group={group}
            state={permissionState[group.label]}
            readOnly={readOnly}
            onToggleParent={() => toggleParent(group)}
            onTogglePage={(page) => togglePage(group, page)}
          />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const getModuleFromPath = (pathname: string): AppModule => {
    if (pathname.startsWith('/skills')) return 'skill';
    if (pathname.startsWith('/permissions')) return 'permission';
    return 'knowledge';
  };

  const [activeModule, setActiveModule] = useState<AppModule>(() => getModuleFromPath(location.pathname));
  const activeSkillPage = SKILL_NAV_ITEMS.find(item => location.pathname.startsWith(item.path)) || SKILL_NAV_ITEMS[0];
  const switchModule = (module: AppModule) => {
    setActiveModule(module);
    navigate(module === 'knowledge' ? '/knowledge' : module === 'skill' ? '/skills/templates' : '/permissions');
  };

  useEffect(() => {
    setActiveModule(getModuleFromPath(location.pathname));
  }, [location.pathname]);

  const [permissionSection, setPermissionSection] = useState<PermissionSection>('users');
  const [permissionSearchQuery, setPermissionSearchQuery] = useState('');
  const [permissionDepartmentFilter, setPermissionDepartmentFilter] = useState('all');
  const [permissionRoleFilter, setPermissionRoleFilter] = useState('all');
  const [permissionStatusFilter, setPermissionStatusFilter] = useState<'all' | PermissionUser['status']>('all');
  const [permissionPage, setPermissionPage] = useState(1);
  const [permissionItemsPerPage, setPermissionItemsPerPage] = useState(10);
  const [openPermissionMenu, setOpenPermissionMenu] = useState<string | null>(null);
  const [permissionAction, setPermissionAction] = useState<{
    type:
      | 'createUser'
      | 'editUser'
      | 'resetPassword'
      | 'assignRole'
      | 'toggleStatus'
      | 'createRole'
      | 'editRole'
      | 'deleteRole'
      | 'viewRoleUsers'
      | 'viewRolePermissions'
      | 'createDepartment'
      | 'editDepartment'
      | 'setDepartmentOwner'
      | 'deleteDepartment'
      | 'addDepartmentMember'
      | 'removeDepartmentMember'
      | 'changeDepartmentMember'
      | 'deleteUser'
      | null;
    user?: PermissionUser;
    role?: PermissionRole;
    department?: PermissionDepartment;
  }>({ type: null });
  const [permissionUsers, setPermissionUsers] = useState<PermissionUser[]>(INITIAL_PERMISSION_USERS);
  const [permissionRoles, setPermissionRoles] = useState<PermissionRole[]>(INITIAL_PERMISSION_ROLES);
  const [permissionDepartments, setPermissionDepartments] = useState<PermissionDepartment[]>(INITIAL_PERMISSION_DEPARTMENTS);
  const [selectedPermissionUserIds, setSelectedPermissionUserIds] = useState<string[]>([]);
  const [isPermissionBatchMode, setIsPermissionBatchMode] = useState(false);
  const [showPermissionBatchDeleteConfirm, setShowPermissionBatchDeleteConfirm] = useState(false);
  const [expandedDepartmentIds, setExpandedDepartmentIds] = useState<string[]>(['D-001', 'D-002']);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('D-001');
  const [searchQuery, setSearchQuery] = useState('');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(INITIAL_KNOWLEDGE_BASES);
  
  // Toast 提示状态
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // 新建知识库页面状态
  const [showNewKBPage, setShowNewKBPage] = useState(false);
  const [editingNewKBId, setEditingNewKBId] = useState<string | null>(null);
  const [newKBStep, setNewKBStep] = useState(1); // 当前步骤：1-基础信息, 2-检索与模型配置, 3-权限与存储
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false); // 取消确认弹窗
  const [isCreatingKB, setIsCreatingKB] = useState(false); // 创建中状态
  const [createKBStatus, setCreateKBStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle'); // 创建状态
  
  // 推荐标签管理
  const [recommendedTags, setRecommendedTags] = useState<string[]>([
    '技术文档', '产品手册', '用户指南', 'API文档', '内部资料', '培训材料', '常见问题', '最佳实践'
  ]);
  const [showTagManageModal, setShowTagManageModal] = useState(false); // 标签管理模态框
  const [newRecommendedTag, setNewRecommendedTag] = useState(''); // 新推荐标签输入
  
  // 权限配置相关状态
  interface TeamPermission {
    teamId: string;
    teamName: string;
    memberCount: number;
    permission: 'view' | 'edit' | 'manage'; // 添加 'manage'
    members: Array<{ id: string; name: string; avatar?: string }>;
    excludedMembers: string[]; // 被排除的成员ID
    memberPermissions: Record<string, 'view' | 'edit' | 'manage'>; // 添加 'manage'
  }
  
  interface RolePermission {
    roleId: string;
    roleName: string;
    memberCount: number;
    permission: 'view' | 'edit' | 'manage'; // 添加 'manage'
    members: Array<{ id: string; name: string; avatar?: string }>;
    excludedMembers: string[]; // 被排除的成员ID
    memberPermissions: Record<string, 'view' | 'edit' | 'manage'>; // 添加 'manage'
  }
  
  const [teamPermissions, setTeamPermissions] = useState<TeamPermission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<{id: string, name: string, permission: 'view' | 'edit' | 'manage'}[]>([]); // 添加 'manage'
  const [selectedPermissionTab, setSelectedPermissionTab] = useState<'member' | 'role' | 'team'>('team'); // 当前选中的权限配置标签
  const [partialCandidateSearch, setPartialCandidateSearch] = useState('');
  const [partialBulkPermission, setPartialBulkPermission] = useState<'view' | 'edit' | 'manage'>('view');
  const [pendingPartialDepartmentIds, setPendingPartialDepartmentIds] = useState<string[]>([]);
  const [pendingPartialRoleIds, setPendingPartialRoleIds] = useState<string[]>([]);
  const [partialSelectedSearch, setPartialSelectedSearch] = useState('');
  const [partialSelectedDepartmentFilter, setPartialSelectedDepartmentFilter] = useState('all');
  const [partialSelectedRoleFilter, setPartialSelectedRoleFilter] = useState('all');
  const [partialSelectedPermissionFilter, setPartialSelectedPermissionFilter] = useState<'all' | 'view' | 'edit' | 'manage'>('all');
  const [selectedPartialMemberIds, setSelectedPartialMemberIds] = useState<string[]>([]);
  const [partialMemberConfigFilter, setPartialMemberConfigFilter] = useState<'unconfigured' | 'configured'>('unconfigured');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null); // 展开的团队ID
  const [expandedManageTeamId, setExpandedManageTeamId] = useState<string | null>(null); // 团队管理模态框中展开的团队ID
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null); // 展开的角色ID
  const [memberSearchQuery, setMemberSearchQuery] = useState(''); // 成员搜索关键词
  const [showMemberDetailModal, setShowMemberDetailModal] = useState(false); // 成员详情模态框
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<{ id: string; name: string; avatar?: string } | null>(null); // 选中的成员详情
  
  // 模拟团队数据
  const mockTeams = [
    { id: 't1', name: '前端开发团队', department: '技术部门', memberCount: 8, members: [
      { id: 'u1', name: '张三', avatar: '' },
      { id: 'u2', name: '李四', avatar: '' },
      { id: 'u3', name: '王五', avatar: '' },
      { id: 'u4', name: '赵六', avatar: '' },
      { id: 'u5', name: '钱七', avatar: '' },
      { id: 'u6', name: '孙八', avatar: '' },
      { id: 'u7', name: '周九', avatar: '' },
      { id: 'u8', name: '吴十', avatar: '' },
    ]},
    { id: 't2', name: '后端开发团队', department: '技术部门', memberCount: 12, members: [
      { id: 'u9', name: '郑一', avatar: '' },
      { id: 'u10', name: '冯二', avatar: '' },
      { id: 'u11', name: '陈三', avatar: '' },
      { id: 'u12', name: '褚四', avatar: '' },
      { id: 'u13', name: '卫五', avatar: '' },
      { id: 'u14', name: '蒋六', avatar: '' },
      { id: 'u15', name: '沈七', avatar: '' },
      { id: 'u16', name: '韩八', avatar: '' },
      { id: 'u17', name: '杨九', avatar: '' },
      { id: 'u18', name: '朱十', avatar: '' },
      { id: 'u19', name: '秦十一', avatar: '' },
      { id: 'u20', name: '尤十二', avatar: '' },
    ]},
    { id: 't3', name: '产品设计团队', department: '产品部门', memberCount: 6, members: [
      { id: 'u21', name: '许一', avatar: '' },
      { id: 'u22', name: '何二', avatar: '' },
      { id: 'u23', name: '吕三', avatar: '' },
      { id: 'u24', name: '施四', avatar: '' },
      { id: 'u25', name: '张五', avatar: '' },
      { id: 'u26', name: '孔六', avatar: '' },
    ]},
    { id: 't4', name: '测试团队', department: '技术部门', memberCount: 5, members: [
      { id: 'u27', name: '曹一', avatar: '' },
      { id: 'u28', name: '严二', avatar: '' },
      { id: 'u29', name: '华三', avatar: '' },
      { id: 'u30', name: '金四', avatar: '' },
      { id: 'u31', name: '魏五', avatar: '' },
    ]},
    { id: 't5', name: '销售团队', department: '业务部门', memberCount: 10, members: [
      { id: 'u32', name: '陶一', avatar: '' },
      { id: 'u33', name: '姜二', avatar: '' },
      { id: 'u34', name: '戚三', avatar: '' },
      { id: 'u35', name: '谢四', avatar: '' },
      { id: 'u36', name: '邹五', avatar: '' },
      { id: 'u37', name: '喻六', avatar: '' },
      { id: 'u38', name: '柏七', avatar: '' },
      { id: 'u39', name: '水八', avatar: '' },
      { id: 'u40', name: '窦九', avatar: '' },
      { id: 'u41', name: '章十', avatar: '' },
    ]},
  ];
  
  // 模拟角色数据
  const mockRoles = [
    { id: 'r1', name: '管理员', memberCount: 3, members: [
      { id: 'u1', name: '张三', avatar: '' },
      { id: 'u9', name: '郑一', avatar: '' },
      { id: 'u21', name: '许一', avatar: '' },
    ]},
    { id: 'r2', name: '产品经理', memberCount: 5, members: [
      { id: 'u21', name: '许一', avatar: '' },
      { id: 'u22', name: '何二', avatar: '' },
      { id: 'u23', name: '吕三', avatar: '' },
      { id: 'u24', name: '施四', avatar: '' },
      { id: 'u25', name: '张五', avatar: '' },
    ]},
    { id: 'r3', name: '开发工程师', memberCount: 20, members: [
      { id: 'u1', name: '张三', avatar: '' },
      { id: 'u2', name: '李四', avatar: '' },
      { id: 'u3', name: '王五', avatar: '' },
      { id: 'u9', name: '郑一', avatar: '' },
      { id: 'u10', name: '冯二', avatar: '' },
    ]},
    { id: 'r4', name: '测试工程师', memberCount: 5, members: [
      { id: 'u27', name: '曹一', avatar: '' },
      { id: 'u28', name: '严二', avatar: '' },
      { id: 'u29', name: '华三', avatar: '' },
      { id: 'u30', name: '金四', avatar: '' },
      { id: 'u31', name: '魏五', avatar: '' },
    ]},
    { id: 'r5', name: '运营', memberCount: 8, members: [
      { id: 'u32', name: '陶一', avatar: '' },
      { id: 'u33', name: '姜二', avatar: '' },
      { id: 'u34', name: '戚三', avatar: '' },
      { id: 'u35', name: '谢四', avatar: '' },
    ]},
  ];

  // 获取所有成员（去重）
  const allMembers = mockRoles.reduce((acc, role) => {
    role.members.forEach(member => {
      if (!acc.find(m => m.id === member.id)) {
        acc.push(member);
      }
    });
    return acc;
  }, [] as {id: string, name: string, avatar: string}[]);

  const permissionRank = { view: 1, edit: 2, manage: 3 } as const;
  const permissionText = { view: '只读', edit: '编辑', manage: '管理' } as const;
  const permissionTone = {
    view: 'bg-slate-100 text-slate-600',
    edit: 'bg-blue-50 text-blue-700',
    manage: 'bg-purple-50 text-purple-700'
  } as const;

  const resolvePartialAccessMembers = () => {
    const memberMap = new Map<string, {
      id: string;
      name: string;
      permission: 'view' | 'edit' | 'manage';
      sources: string[];
    }>();

    const addMember = (member: { id: string; name: string }, permission: 'view' | 'edit' | 'manage', source: string) => {
      const current = memberMap.get(member.id);
      if (!current) {
        memberMap.set(member.id, { id: member.id, name: member.name, permission, sources: [source] });
        return;
      }
      current.sources = Array.from(new Set([...current.sources, source]));
      if (permissionRank[permission] > permissionRank[current.permission]) {
        current.permission = permission;
      }
    };

    teamPermissions.forEach((team) => {
      team.members
        .filter((member) => !team.excludedMembers.includes(member.id))
        .forEach((member) => addMember(member, team.memberPermissions[member.id] || team.permission, `部门：${team.teamName}`));
    });

    rolePermissions.forEach((role) => {
      role.members
        .filter((member) => !role.excludedMembers.includes(member.id))
        .forEach((member) => addMember(member, role.memberPermissions[member.id] || role.permission, `角色：${role.roleName}`));
    });

    selectedMembers.forEach((member) => addMember(member, member.permission, '个人授权'));

    return Array.from(memberMap.values()).sort((a, b) => permissionRank[b.permission] - permissionRank[a.permission]);
  };
  
  const [newKBConfig, setNewKBConfig] = useState({
    // 步骤一：基础信息
    icon: '📚',
    iconUrl: '', // 自定义上传的图标URL
    name: '',
    description: '',
    category: '通用知识库', // 通用知识库、企业知识库、FAQ知识库、API知识库
    tags: [] as string[],
    kbType: '通用知识库',
    
    // 步骤二：检索与模型配置
    retrievalMethod: '混合检索', // 混合检索、向量检索、全文检索
    vectorModel: 'text-embedding-3-large',
    rerankModel: 'bge-reranker-v2-m3',
    topK: 5,
    similarityThreshold: 0.7,
    maxRecall: 10,
    defaultChunkStrategy: 'smart', // 默认切片策略
    defaultChunkSize: 800,
    defaultOverlap: 100,
    
    // 步骤三：权限与存储
    permissionType: 'public', // 'public' | 'private' | 'partial' - 默认公开
    allowedTeams: [] as string[], // 自定义权限：允许的团队
    allowedUsers: [] as string[], // 自定义权限：允许的用户
    vectorStorage: 'default' // 向量库存储方式
  });
  
  // 知识库详情页面状态
  const [selectedKB, setSelectedKB] = useState<KnowledgeBase | null>(null);
  // hoveredKBId removed - description now uses fixed line clamp
  
  // 根据选中的知识库获取对应的文档列表
  const getCurrentDocuments = () => {
    if (!selectedKB) return [];
    return selectedKB.documents || [];
  };
  
  
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docStatusFilter, setDocStatusFilter] = useState<'all' | MergedDocStatus>('all');
  const [docFormatFilter, setDocFormatFilter] = useState<string[]>([]); // 修改为数组，支持多选
  const [docSortField, setDocSortField] = useState<'lastEdited' | 'callCount'>('lastEdited');
  const [docSortDirection, setDocSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false); // 控制排序下拉菜单显示
  const [showStatusDropdown, setShowStatusDropdown] = useState(false); // 控制状态筛选下拉菜单
  const [showFormatDropdown, setShowFormatDropdown] = useState(false); // 控制文件格式筛选下拉菜单
  const [showTagsDropdown, setShowTagsDropdown] = useState(false); // 控制标签筛选下拉菜单
  const [pendingSelectedTags, setPendingSelectedTags] = useState<string[]>([]); // 标签下拉菜单中的临时选择，点击确定后才生效
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null); // 选中的文档（用于详情页）
  const [showDocumentChunks, setShowDocumentChunks] = useState(false);
  const [activeDocumentChunkId, setActiveDocumentChunkId] = useState(1);
  const [expandedDocumentChunkIds, setExpandedDocumentChunkIds] = useState<number[]>([]);
  const [chunkSearchQuery, setChunkSearchQuery] = useState('');
  const [chunkStatusFilter, setChunkStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [chunkEnabledMap, setChunkEnabledMap] = useState<Record<number, boolean>>({});
  const [activeImageChunkId, setActiveImageChunkId] = useState<string | null>(null);
    const [showChunkEditModal, setShowChunkEditModal] = useState(false);
    const [editingChunkId, setEditingChunkId] = useState<number | null>(null);
    const [editingChunkText, setEditingChunkText] = useState('');
  const [chunkEdits, setChunkEdits] = useState<Record<number, string>>({});
  const originalTextScrollRef = useRef<HTMLDivElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(472);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // 切片变换时，左侧原文对照自动滚动到对应高亮区域
  useEffect(() => {
    if (!originalTextScrollRef.current) return;
    const el = originalTextScrollRef.current.querySelector(`[data-chunk-id="${activeDocumentChunkId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeDocumentChunkId]);
  useEffect(() => {
    setAudioCurrentTime(0);
    setIsAudioPlaying(false);
    setActiveImageChunkId(null);
  }, [selectedDocument?.id]);
  const [docCurrentPage, setDocCurrentPage] = useState(1);
  const [docItemsPerPage, setDocItemsPerPage] = useState(10);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false); // 批量删除确认弹窗
  const [showSingleDeleteModal, setShowSingleDeleteModal] = useState(false); // 单个文档删除确认弹窗
  const [deletingDoc, setDeletingDoc] = useState<Document | null>(null); // 要删除的文档
  const [showRenameDocModal, setShowRenameDocModal] = useState(false);
  const [renamingDoc, setRenamingDoc] = useState<Document | null>(null);
  const [renameDocName, setRenameDocName] = useState('');
  
  const [showTagConfigModal, setShowTagConfigModal] = useState(false);
  const [editingDocForTags, setEditingDocForTags] = useState<Document | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [showTagViewModal, setShowTagViewModal] = useState(false); // 新增：查看标签模态框
  const [viewingDocTags, setViewingDocTags] = useState<Document | null>(null); // 新增：正在查看标签的文档
  const [showKBTagViewModal, setShowKBTagViewModal] = useState(false); // 新增：知识库标签查看模态框
  const [viewingKBTags, setViewingKBTags] = useState<KnowledgeBase | null>(null); // 新增：正在查看标签的知识库
  const [showKBTagConfigModal, setShowKBTagConfigModal] = useState(false); // 新增：知识库标签配置模态框
  const [editingKBForTags, setEditingKBForTags] = useState<KnowledgeBase | null>(null); // 新增：正在编辑标签的知识库
  const [newKBTagInput, setNewKBTagInput] = useState(''); // 新增：新标签输入
  const [editingKBTagInput, setEditingKBTagInput] = useState('');
  const [showKBPermissionModal, setShowKBPermissionModal] = useState(false); // 知识库权限管理模态框
  const [editingKBForPermission, setEditingKBForPermission] = useState<KnowledgeBase | null>(null); // 正在编辑权限的知识库
  const [kbPermissionTab, setKbPermissionTab] = useState<'access' | 'advanced'>('access');
  const [kbAccessSearchQuery, setKbAccessSearchQuery] = useState('');
  const [kbAddAccessRole, setKbAddAccessRole] = useState<'admin' | 'member' | 'readonly'>('member');
  const [kbUserAccessEntries, setKbUserAccessEntries] = useState([
    { id: 'owner', name: '海洋饼干', sub: '创建者', avatar: '海', role: 'admin' as const, locked: true },
    { id: 'U-1004', name: '王一博', sub: 'wang.yibo@example.com', avatar: '王', role: 'readonly' as const, locked: false }
  ]);
  const [kbDepartmentAccessEntries, setKbDepartmentAccessEntries] = useState([
    { id: 'D-001', name: '技术部门', sub: '8人', avatar: '技', role: 'member' as const, locked: false }
  ]);
  const [kbAdminOverrideEnabled, setKbAdminOverrideEnabled] = useState(true);
  const [kbJoinApprovalEnabled, setKbJoinApprovalEnabled] = useState(false);
  const [showTransferOwnerModal, setShowTransferOwnerModal] = useState(false); // 转移所有权模态框
  const [transferSearchQuery, setTransferSearchQuery] = useState(''); // 转移所有权搜索关键词
  const [showManageCollaboratorModal, setShowManageCollaboratorModal] = useState(false); // 管理协作者模态框
  const [showManageTeamModal, setShowManageTeamModal] = useState(false); // 管理团队模态框
  const [showManageMemberModal, setShowManageMemberModal] = useState(false); // 管理成员模态框
  const [editingTeam, setEditingTeam] = useState<{id: string, name: string, memberCount: number, members: any[]} | null>(null); // 正在编辑的团队
  const [editingMember, setEditingMember] = useState<{id: string, name: string, avatar: string, department?: string} | null>(null); // 正在编辑的成员
  const [managedTeams, setManagedTeams] = useState(mockTeams); // 管理的团队列表
  const [managedMembers, setManagedMembers] = useState(allMembers.map(m => ({...m, department: '未分配'}))); // 管理的成员列表
  const [teamSearchQuery, setTeamSearchQuery] = useState(''); // 团队搜索关键词
  const [collaboratorTab, setCollaboratorTab] = useState<'member' | 'team'>('member'); // 协作者标签页
  const [collaboratorSearchQuery, setCollaboratorSearchQuery] = useState(''); // 协作者搜索关键词
  const [selectedTransferUser, setSelectedTransferUser] = useState<string | null>(null); // 选中的转移目标用户
  const [addedMembers, setAddedMembers] = useState<Array<{name: string, email: string, avatar: string, color: string, permission: string}>>([
    { name: '张设计师', email: 'zhang@example.com', avatar: '张', color: 'from-purple-500 to-purple-600', permission: 'write' },
    { name: '李开发', email: 'li@example.com', avatar: '李', color: 'from-green-500 to-green-600', permission: 'read' },
  ]); // 已添加的成员
  const [addedTeams, setAddedTeams] = useState<Array<{
    name: string, 
    members: number, 
    avatar: string, 
    color: string, 
    permission: string,
    expanded?: boolean,
    teamMembers?: Array<{id: string, name: string, email: string, color: string}>,
    memberPermissions?: Record<string, string>
  }>>([
    { 
      name: '开发团队', 
      members: 15, 
      avatar: '开', 
      color: 'from-green-500 to-green-600', 
      permission: 'admin',
      expanded: false,
      teamMembers: [
        { id: 'dev1', name: '张开发', email: 'zhang.dev@example.com', color: 'from-blue-500 to-blue-600' },
        { id: 'dev2', name: '李前端', email: 'li.fe@example.com', color: 'from-purple-500 to-purple-600' },
        { id: 'dev3', name: '王后端', email: 'wang.be@example.com', color: 'from-orange-500 to-orange-600' },
        { id: 'dev4', name: '赵全栈', email: 'zhao.fs@example.com', color: 'from-pink-500 to-pink-600' },
        { id: 'dev5', name: '刘测试', email: 'liu.qa@example.com', color: 'from-indigo-500 to-indigo-600' },
      ],
      memberPermissions: {
        'dev1': 'admin',
        'dev2': 'admin',
        'dev3': 'admin',
        'dev4': 'admin',
        'dev5': 'admin',
      }
    },
  ]); // 已添加的团队
  const [showFileUploadPage, setShowFileUploadPage] = useState(false); // 文件上传页面
  const [showFileUploadExitModal, setShowFileUploadExitModal] = useState(false); // 文件上传退出确认弹窗
  const [uploadingFiles, setUploadingFiles] = useState<Array<{
    rawFile?: File;
    id: string;
    name: string;
    size: number;
    progress: number;
    status: 'uploading' | 'success' | 'error';
    sourceType?: 'text' | 'table' | 'web' | 'image' | 'audio';
    content?: string;
    sourceUrl?: string;
    previewUrl?: string;
    parseNote?: string;
    problemReason?: string;
    ocrStatus?: ImageOcrResult['status'];
    ocrText?: string;
    ocrConfidence?: number;
    ocrMessage?: string;
    imageVisionStatus?: ImageVisionResult['status'];
    imageVisionLabels?: ImageVisionLabel[];
    imageVisionCaption?: string;
    imageVisionMessage?: string;
    imageVisionProvider?: ImageVisionResult['provider'];
    asrStatus?: AudioTranscriptionResult['status'];
    asrText?: string;
    asrSegments?: AudioTranscriptSegment[];
    asrMessage?: string;
    asrProvider?: AudioTranscriptionResult['provider'];
  }>>([]);
  const [fileUploadStep, setFileUploadStep] = useState(1); // 文件上传步骤
  const [fileUploadFileType, setFileUploadFileType] = useState<'text' | 'table' | 'web' | 'image' | 'audio'>('text'); // 文件类型选择
  const [fileUploadListPage, setFileUploadListPage] = useState(1); // 文件列表分页
  const [fileUploadShowProblems, setFileUploadShowProblems] = useState(false); // 只显示问题文件
  const [webUploadUrl, setWebUploadUrl] = useState('');
  const [webAddedUrls, setWebAddedUrls] = useState<Array<{ id: string; url: string; status: 'fetching' | 'success' | 'fallback' | 'error'; title?: string; content?: string }>>([]);
  const [webEnableHtmlFilter, setWebEnableHtmlFilter] = useState(false);
  const [webHtmlSelector, setWebHtmlSelector] = useState('');
  const [webExtractLinks, setWebExtractLinks] = useState(true);
  const [step2SliceMethod, setStep2SliceMethod] = useState<'smart' | 'title' | 'record' | 'page'>('smart'); // 切片方法
  const [step2SmartConfig, setStep2SmartConfig] = useState({
    segmentDelimiterPreset: 'blankLine',
    segmentDelimiter: '\\n\\n',
    maxLength: 1000,
    overlap: 80,
    shortMergeThreshold: 150,
    keepTitlePath: true,
    longContentStrategy: '按段落/句子继续拆分'
  });
  const [step2TitleConfig, setStep2TitleConfig] = useState({
    titleDepth: '二级',
    keepParentTitle: true,
    maxLength: 1500,
    overlap: 100,
    longBlockStrategy: '按段落继续拆分',
    shortBlockStrategy: '合并到上级标题'
  });
  const [step2RecordConfig, setStep2RecordConfig] = useState({
    detectionMode: '自动识别',
    recordUnit: '自动识别',
    questionField: '问题 / 标题 / Query',
    answerField: '答案 / 内容 / Answer',
    metadataFields: '分类、标签、来源、更新时间',
    maxLength: 1200,
    overlap: 20,
    longAnswerStrategy: '按段落继续拆分',
    keepFieldNames: true
  });
  const [step2PageConfig, setStep2PageConfig] = useState({
    pageUnit: '每页一块',
    mergeAcrossPages: false,
    keepPageNumber: true,
    removeHeaderFooter: true,
    ocrMode: '自动',
    layoutOrderRecognition: true,
    pageMaxLength: 1500,
    pageOverlap: 100,
    crossPageOverlap: 50
  });
  const [step2TableParseConfig, setStep2TableParseConfig] = useState({
    parseMode: 'row',
    fileTypeRecognition: '自动识别',
    headerDetection: 'specified',
    headerRow: 1,
    skipEmptyRows: true,
    keepEmptyRows: false,
    conversionMode: 'natural',
    descriptionTemplate: '{表头1}为{值1}，{表头2}为{值2}',
    descriptionFields: [
      { header: '表头1', value: '值1' },
      { header: '表头2', value: '值2' }
    ],
    mergeStrategy: 'primaryKey',
    primaryKeyField: '员工ID',
    questionColumn: '问题 / 标题 / Query',
    answerColumn: '答案 / 内容 / Answer',
    metadataColumns: '分类、标签、来源',
    mergeEmptyCells: true
  });
  const [step2ImageQaConfig, setStep2ImageQaConfig] = useState({
    parseMode: 'fullImage',
    ocrLanguageMode: 'auto',
    orientationCorrection: true
  });
  const [step2AudioParseConfig, setStep2AudioParseConfig] = useState({
    parseMode: 'full',
    languageMode: 'auto',
    noiseReduction: true
  });
  const [step2WebParseConfig, setStep2WebParseConfig] = useState({
    parseMode: 'main',
    encodingDetection: 'auto',
    removeScriptsAndStyles: true,
    removeChrome: true,
    keepPageTitle: true
  });
  const [step2IndexMethod, setStep2IndexMethod] = useState<'向量检索' | '全文检索' | '混合检索'>('混合检索');
  const [step2IndexConfig, setStep2IndexConfig] = useState({
    vectorTopK: 3,
    similarityThreshold: 0.7,
    fullTextTopK: 3,
    keywordBoost: 0.7,
    vectorWeight: 70,
    fullTextWeight: 30,
  });
  const [step2ReplaceSpaces, setStep2ReplaceSpaces] = useState(true); // 替换空格
  const [step2RemoveUrls, setStep2RemoveUrls] = useState(false); // 删除URL
  const [step2PreviewFileIndex, setStep2PreviewFileIndex] = useState(0); // 预览文件索引
  const [step2PreviewChunks, setStep2PreviewChunks] = useState<Array<{id: string, content: string}>>([]);
  const [step2ShowPreview, setStep2ShowPreview] = useState(false);
  const step2SliceMethodOptions = [
    {
      key: 'smart',
      title: '智能切片',
      subtitle: '自动识别结构',
      helper: '普通文档默认用',
      icon: Sparkles,
      scene: '普通 Word、PDF、网页正文、产品手册、制度文件、通用文档。',
      description: '系统自动识别标题、段落和句子边界，优先保证语义完整；超长内容再按长度补切。'
    },
    {
      key: 'title',
      title: '按标题切分',
      subtitle: '保留目录层级',
      helper: '结构化文档用',
      icon: Type,
      scene: '技术文档、API 文档、规章制度、白皮书、说明书、论文类文档。',
      description: '按照文档标题层级切分，切片内容保持原文，不额外添加系统生成说明。'
    },
    {
      key: 'record',
      title: '按问答/记录切分',
      subtitle: '一条知识一块',
      helper: 'FAQ、表格、知识条目用',
      icon: MessageSquare,
      scene: 'FAQ、客服问答、表格型知识、产品问答、政策条目、知识库标准条目。',
      description: '按问答对、表格行或知识条目切分，确保一条完整知识作为一个独立块，适合 FAQ 和结构化知识库。'
    },
    {
      key: 'page',
      title: '按页切分',
      subtitle: '保留页码溯源',
      helper: 'PDF、扫描件、合同、报告溯源用',
      icon: FileStack,
      scene: 'PDF、扫描件、合同、论文、报告、政策文件、需要精确页码溯源的资料。',
      description: '按照页码边界切分，并保留页码来源，适合 PDF、扫描件、合同和需要精确溯源的报告类文档。'
    }
  ] as const;
  const visibleStep2SliceMethodOptions = step2SliceMethodOptions.filter((method) => {
    if (fileUploadFileType === 'text') return method.key === 'smart' || method.key === 'title';
    if (fileUploadFileType === 'audio') return method.key !== 'title';
    if (fileUploadFileType === 'web') return method.key !== 'page';
    return true;
  });
  const selectedStep2SliceMethod =
    visibleStep2SliceMethodOptions.find((method) => method.key === step2SliceMethod) || visibleStep2SliceMethodOptions[0];
  useEffect(() => {
    if (!visibleStep2SliceMethodOptions.some(method => method.key === step2SliceMethod)) {
      setStep2SliceMethod(visibleStep2SliceMethodOptions[0]?.key || 'smart');
    }
  }, [fileUploadFileType, step2SliceMethod, visibleStep2SliceMethodOptions]);
  const step2UploadTypeOptions = {
    text: { title: '导入文本文档', desc: '文档内容切片入库', icon: FileText, tone: 'blue' },
    table: { title: '导入表格型知识', desc: '按表格行和字段解析为知识条目', icon: Layout, tone: 'emerald' },
    image: { title: '导入图片文件', desc: '按图片问答或 OCR 内容入库', icon: Image, tone: 'orange' },
    audio: { title: '导入音频文件', desc: '音频转写后按文本切片入库', icon: Video, tone: 'pink' },
    web: { title: '读取网页数据', desc: '抓取正文后按文本切片入库', icon: Globe, tone: 'violet' }
  } as const;
  const selectedStep2UploadType = step2UploadTypeOptions[fileUploadFileType];
  const skipUploadRuleConfig = fileUploadFileType === 'image' || fileUploadFileType === 'audio';
  const uploadStepItems = skipUploadRuleConfig
    ? [
        { num: 1, label: '上传文件' },
        { num: 3, displayNum: 2, label: '文件处理' }
      ]
    : [
        { num: 1, label: '上传文件' },
        { num: 2, label: '规则配置' },
        { num: 3, label: '文件处理' }
      ];
  const isStep2GenericSliceType = fileUploadFileType === 'text' || fileUploadFileType === 'audio' || fileUploadFileType === 'web';
  const applyStep2SliceMethod = (methodKey: typeof step2SliceMethod) => {
    const method = visibleStep2SliceMethodOptions.find((item) => item.key === methodKey) || visibleStep2SliceMethodOptions[0];
    setStep2SliceMethod(method.key);
    setStep2PreviewChunks([]);
    setStep2ShowPreview(false);
  };
  const applyFileUploadType = (type: typeof fileUploadFileType) => {
    if (type !== fileUploadFileType) {
      setUploadingFiles([]);
      setWebAddedUrls([]);
      setFileUploadShowProblems(false);
      setFileUploadListPage(1);
    }
    setFileUploadFileType(type);
    setStep2PreviewChunks([]);
    setStep2ShowPreview(false);
    if ((type === 'image' || type === 'audio') && fileUploadStep === 2) {
      setFileUploadStep(1);
    }
  };
  const getStep2ChunkSummary = () => {
    if (step2SliceMethod === 'title') {
      return `${step2TitleConfig.titleDepth} / 最大 ${step2TitleConfig.maxLength} 字符 / 重叠 ${step2TitleConfig.overlap} 字符`;
    }
    if (step2SliceMethod === 'record') {
      return `${step2RecordConfig.recordUnit} / 最大 ${step2RecordConfig.maxLength} 字符 / 重叠 ${step2RecordConfig.overlap} 字符`;
    }
    if (step2SliceMethod === 'page') {
      return `${step2PageConfig.pageUnit} / ${step2PageConfig.keepPageNumber ? '保留页码' : '不保留页码'} / OCR ${step2PageConfig.ocrMode}`;
    }
    return `标识符 ${step2SmartConfig.segmentDelimiter || '\\n\\n'} / 最大 ${step2SmartConfig.maxLength} 字符 / 重叠 ${step2SmartConfig.overlap} 字符`;
  };
  const getStep3RuleSummary = () => {
    if (fileUploadFileType === 'table') {
      return {
        label: '解析规则',
        title: '表格内容解析',
        desc: '基础解析 / 按表格行和字段生成知识条目'
      };
    }
    if (fileUploadFileType === 'image') {
      return {
        label: '解析规则',
        title: '图片 OCR 识别',
        desc: ''
      };
    }
    if (fileUploadFileType === 'audio') {
      return {
        label: '解析规则',
        title: '音频解析（ASR）',
        desc: ''
      };
    }
    if (fileUploadFileType === 'web') {
      return {
        label: '网页切片',
        title: selectedStep2SliceMethod.title,
        desc: `${step2WebParseConfig.parseMode === 'main' ? '自动提取正文' : '提取全部文字'} / 自动编码识别 / ${getStep2ChunkSummary()}`
      };
    }
    return {
      label: '分段模式',
      title: selectedStep2SliceMethod.title,
      desc: getStep2ChunkSummary()
    };
  };
  const resetStep2SliceConfig = () => {
    if (step2SliceMethod === 'title') {
      setStep2TitleConfig({
        titleDepth: '二级',
        keepParentTitle: true,
        maxLength: 1500,
        overlap: 100,
        longBlockStrategy: '按段落继续拆分',
        shortBlockStrategy: '合并到上级标题'
      });
    } else if (step2SliceMethod === 'record') {
      setStep2RecordConfig({
        detectionMode: '自动识别',
        recordUnit: '自动识别',
        questionField: '问题 / 标题 / Query',
        answerField: '答案 / 内容 / Answer',
        metadataFields: '分类、标签、来源、更新时间',
        maxLength: 1200,
        overlap: 20,
        longAnswerStrategy: '按段落继续拆分',
        keepFieldNames: true
      });
    } else if (step2SliceMethod === 'page') {
      setStep2PageConfig({
        pageUnit: '每页一块',
        mergeAcrossPages: false,
        keepPageNumber: true,
        removeHeaderFooter: true,
        ocrMode: '自动',
        layoutOrderRecognition: true,
        pageMaxLength: 1500,
        pageOverlap: 100,
        crossPageOverlap: 50
      });
    } else {
      setStep2SmartConfig({
        segmentDelimiterPreset: 'blankLine',
        segmentDelimiter: '\\n\\n',
        maxLength: 1000,
        overlap: 80,
        shortMergeThreshold: 150,
        keepTitlePath: true,
        longContentStrategy: '按段落/句子继续拆分'
      });
    }
    setStep2ReplaceSpaces(true);
    setStep2RemoveUrls(false);
    setStep2PreviewChunks([]);
    setStep2ShowPreview(false);
  };
  const renderConfigHelp = (text: string) => (
    <span className="relative group inline-flex">
      <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-400 transition-colors group-hover:border-blue-400 group-hover:text-blue-500">?</span>
      <span className="pointer-events-none invisible absolute left-1/2 top-6 z-50 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-5 text-white opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
  const renderConfigLabel = (label: string, help?: string) => (
    <div className="mb-2 flex h-5 items-center gap-1.5 text-xs font-medium text-slate-600">
      <span>{label}</span>
      {help && renderConfigHelp(help)}
    </div>
  );
  const configInputClass = 'h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none';
  const configSelectClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
  const configFieldClass = 'rounded-xl border border-slate-200 bg-white px-3 py-3 transition focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-100';
  const renderNumberField = (label: string, value: number, onChange: (value: number) => void, fallback: number, help?: string) => (
    <div className={configFieldClass}>
      {renderConfigLabel(label, help)}
      <div className="flex h-10 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
        <input type="number" value={value} onChange={(e) => onChange(parseInt(e.target.value) || fallback)} className={configInputClass} />
        <span className="flex items-center border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-400">chars</span>
      </div>
    </div>
  );
  const renderSelectField = (label: string, value: string, onChange: (value: string) => void, options: string[], help?: string) => (
    <div className={configFieldClass}>
      {renderConfigLabel(label, help)}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={configSelectClass}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
  const renderDelimiterField = () => {
    const delimiterOptions = [
      { label: '空行', value: '\\n\\n' },
      { label: '换行', value: '\\n' },
      { label: '句号', value: '。' },
      { label: '分号', value: '；' },
      { label: '英文句号', value: '.' },
      { label: '英文分号', value: ';' },
      { label: 'Markdown 标题', value: '\\n## ' },
      { label: '自定义', value: step2SmartConfig.segmentDelimiter }
    ];
    return (
      <div className={configFieldClass}>
        {renderConfigLabel('分段标识符', '系统会优先按照该标识符拆分文本，例如空行、换行、句号或自定义符号；拆分后的片段仍会受最大长度限制。')}
        <div className="grid gap-2 md:grid-cols-[160px_1fr]">
          <select
            value={step2SmartConfig.segmentDelimiterPreset}
            onChange={(e) => {
              const preset = e.target.value;
              const match = delimiterOptions.find(option => option.label === preset);
              setStep2SmartConfig(prev => ({
                ...prev,
                segmentDelimiterPreset: preset,
                segmentDelimiter: match?.value || prev.segmentDelimiter
              }));
            }}
            className={configSelectClass}
          >
            {delimiterOptions.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
          </select>
          <input
            value={step2SmartConfig.segmentDelimiter}
            onChange={(e) => setStep2SmartConfig(prev => ({ ...prev, segmentDelimiterPreset: '自定义', segmentDelimiter: e.target.value }))}
            placeholder="输入分段标识符，如 \\n\\n、---、###"
            className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>
    );
  };
  const renderSwitchField = (label: string, checked: boolean, onChange: (checked: boolean) => void, help?: string) => (
    <button type="button" onClick={() => onChange(!checked)} className={`flex min-h-[68px] w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-all ${
      checked ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
    }`}>
      <span className="flex min-w-0 items-center gap-1.5 font-medium">
        <span className="truncate">{label}</span>
        {help && renderConfigHelp(help)}
      </span>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
        checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
      }`}>
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
    </button>
  );
  const renderRecommendedTitle = (title: string, recommended?: boolean) => (
    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-5 text-slate-900">
      <span>{title}</span>
      {recommended && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold leading-none text-blue-700">推荐</span>
      )}
    </div>
  );
  const chunkWithOverlap = (text: string, maxLength: number, overlap: number) => {
    const cleanText = text.trim();
    if (!cleanText) return [];
    const chunks: string[] = [];
    let start = 0;
    const safeMaxLength = Math.max(1, Math.floor(maxLength) || cleanText.length);
    const safeOverlap = Math.min(Math.max(0, Math.floor(overlap) || 0), Math.max(0, safeMaxLength - 1));
    while (start < cleanText.length) {
      const end = Math.min(cleanText.length, start + safeMaxLength);
      chunks.push(cleanText.slice(start, end).trim());
      if (end >= cleanText.length) break;
      start = Math.max(end - safeOverlap, start + 1);
    }
    return chunks.filter(Boolean);
  };
  const chunkSegmentsByLength = (segments: string[], maxLength: number, overlap: number) =>
    segments.flatMap(segment => chunkWithOverlap(segment, maxLength, overlap));
  const mergeShortSegments = (segments: string[], threshold: number) => {
    const merged: string[] = [];
    segments.forEach((segment) => {
      const text = segment.trim();
      if (!text) return;
      const last = merged[merged.length - 1];
      if (last && text.length < threshold) {
        merged[merged.length - 1] = `${last}\n\n${text}`;
      } else {
        merged.push(text);
      }
    });
    return merged;
  };
  const getWebPageTitle = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '') || '网页内容';
    } catch {
      return '网页内容';
    }
  };
  const createFallbackWebContent = (url: string) => {
    const title = getWebPageTitle(url);
    return [
      `# ${title}`,
      `来源地址：${url}`,
      '## 网页内容摘要',
      '系统已为该网页生成可用于规则配置和切片预览的正文内容。由于浏览器跨域、网络权限或目标站点限制，当前环境可能无法直接读取完整网页正文。',
      '## 解析结果',
      '网页读取会先提取标题、正文段落、列表信息和关键链接，再进入规则配置步骤。后续可按智能切片或按问答/记录切分生成知识片段。',
      '## 常见问题',
      '问题：为什么某些网页无法直接抓取？',
      '答案：部分站点会限制跨域请求、登录访问或搜索结果页抓取。系统会保留原始 URL，并生成兜底正文，确保可以继续配置切片和查看处理进度。',
      '问题：网页内容如何进入知识库？',
      '答案：网页正文会作为一个网页文件进入处理队列，后续按所选切片规则拆分成可检索片段。'
    ].join('\n\n');
  };
  const extractTextFromHtml = (html: string, url: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg, canvas, iframe').forEach(node => node.remove());
    const title = doc.querySelector('title')?.textContent?.trim() || getWebPageTitle(url);
    const selector = webEnableHtmlFilter && webHtmlSelector.trim() ? webHtmlSelector.trim() : '';
    const root = selector ? doc.querySelector(selector) || doc.body : doc.body;
    const text = (root?.textContent || '').replace(/\s+/g, ' ').trim();
    const links = webExtractLinks
      ? Array.from(doc.querySelectorAll('a[href]'))
          .slice(0, 8)
          .map((link) => `${link.textContent?.replace(/\s+/g, ' ').trim() || '链接'}：${(link as HTMLAnchorElement).href}`)
          .filter(Boolean)
      : [];
    return [
      `# ${title}`,
      `来源地址：${url}`,
      '## 网页正文',
      text || createFallbackWebContent(url),
      ...(links.length > 0 ? ['## 页面链接', ...links] : [])
    ].join('\n\n');
  };
  const createWebFileFromUrl = async (url: string) => {
    const id = `web-${Date.now()}`;
    const title = getWebPageTitle(url);
    const fileName = `${title}.html`;
    const fallbackContent = createFallbackWebContent(url);
    setWebAddedUrls([{ id, url, status: 'fetching', title, content: fallbackContent }]);
    setUploadingFiles([{
      id,
      name: fileName,
      size: fallbackContent.length,
      progress: 35,
      status: 'uploading',
      sourceType: 'web',
      content: fallbackContent,
      sourceUrl: url
    }]);
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const content = extractTextFromHtml(html, url);
      setWebAddedUrls([{ id, url, status: 'success', title, content }]);
      setUploadingFiles([{
        id,
        name: fileName,
        size: content.length,
        progress: 100,
        status: 'success',
        sourceType: 'web',
        content,
        sourceUrl: url,
        parseNote: '已读取网页正文，可按网页解析规则生成切片预览。'
      }]);
      const autoTags = generateFileUploadTags('web', [{ name: fileName, url, content }], fileUploadTagGenerationCount);
      setAutoGeneratedFileTags(autoTags);
      setFileUploadTags(prev => {
        const manualTags = prev.filter(tag => !autoGeneratedFileTags.includes(tag));
        return Array.from(new Set([...manualTags, ...autoTags]));
      });
      showToast('success', '网页内容已抓取');
    } catch {
      setWebAddedUrls([{ id, url, status: 'fallback', title, content: fallbackContent }]);
      setUploadingFiles([{
        id,
        name: fileName,
        size: fallbackContent.length,
        progress: 100,
        status: 'success',
        sourceType: 'web',
        content: fallbackContent,
        sourceUrl: url,
        parseNote: '当前环境无法直接读取网页，已生成兜底正文用于规则配置和切片预览。'
      }]);
      const autoTags = generateFileUploadTags('web', [{ name: fileName, url, content: fallbackContent }], fileUploadTagGenerationCount);
      setAutoGeneratedFileTags(autoTags);
      setFileUploadTags(prev => {
        const manualTags = prev.filter(tag => !autoGeneratedFileTags.includes(tag));
        return Array.from(new Set([...manualTags, ...autoTags]));
      });
      showToast('success', '链接已添加，已生成网页预览内容');
    }
  };
  const getReadableFileContent = (file?: { name: string; content?: string }) => {
    if (!file) return '';
    if (file.content?.trim()) return file.content.trim();
    return '';
  };
  const getFileExtension = (name?: string) => name?.split('.').pop()?.toLowerCase() || '';
  const getFileUploadRules = (sourceType: typeof fileUploadFileType) => {
    const rules = {
      text: { extensions: ['doc', 'txt', 'docx', 'pdf', 'ppt', 'pptx', 'md'], maxSize: 100 * 1024 * 1024, label: '文档' },
      table: { extensions: ['xlsx', 'xls', 'csv', 'json'], maxSize: 100 * 1024 * 1024, label: '表格' },
      image: { extensions: ['png', 'jpg', 'jpeg', 'bmp'], maxSize: 50 * 1024 * 1024, label: '图片' },
      audio: { extensions: ['wav', 'mp3', 'm4a', 'amr', 'mp4', 'mov', 'avi'], maxSize: 1024 * 1024 * 1024, label: '音视频' },
      web: { extensions: ['html'], maxSize: 20 * 1024 * 1024, label: '网页' }
    } as const;
    return rules[sourceType];
  };
  const getFileSizeText = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
    if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)}MB`;
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  };
  const validateUploadFile = (file: File, sourceType: typeof fileUploadFileType, existingNames: string[], priorBatchNames: string[]) => {
    const rules = getFileUploadRules(sourceType);
    const ext = getFileExtension(file.name);
    if (!rules.extensions.includes(ext as never)) {
      return `文件格式不支持。当前上传方式仅支持 ${rules.extensions.map(item => `.${item}`).join(' / ')} 格式。`;
    }
    if (file.size <= 0) {
      return '文件内容为空，无法生成解析预览或进入知识库处理。';
    }
    if (file.size > rules.maxSize) {
      return `文件大小超过限制。${rules.label}文件单个大小不能超过 ${getFileSizeText(rules.maxSize)}。`;
    }
    const normalizedName = file.name.trim().toLowerCase();
    if (existingNames.includes(normalizedName) || priorBatchNames.includes(normalizedName)) {
      return '文件名重复。请移除重复文件后再继续处理。';
    }
    return '';
  };
  const canReadFileAsText = (fileName: string) => ['txt', 'md', 'csv', 'json'].includes(getFileExtension(fileName));
  const normalizeCsvLine = (line: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells.map(cell => cell.replace(/^"|"$/g, '').trim());
  };
  const parseTableRowsFromText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return { headers: [] as string[], rows: [] as Record<string, string>[] };
    try {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
      if (items.length > 0 && typeof items[0] === 'object') {
        const headers = Array.from(new Set(items.flatMap((item: Record<string, unknown>) => Object.keys(item || {}))));
        return {
          headers,
          rows: items.slice(0, 30).map((item: Record<string, unknown>) =>
            Object.fromEntries(headers.map(header => [header, String(item?.[header] ?? '')]))
          )
        };
      }
    } catch {
      // Not JSON, continue as CSV-like text.
    }
    const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(line => step2TableParseConfig.keepEmptyRows || line);
    const nonEmptyLines = step2TableParseConfig.skipEmptyRows ? lines.filter(Boolean) : lines;
    const rawRows = nonEmptyLines.map(normalizeCsvLine).filter(row => row.some(Boolean));
    if (rawRows.length === 0) return { headers: [] as string[], rows: [] as Record<string, string>[] };
    const headerIndex = step2TableParseConfig.headerDetection === 'specified'
      ? Math.max(0, Math.min(step2TableParseConfig.headerRow - 1, rawRows.length - 1))
      : 0;
    const headers = rawRows[headerIndex].map((cell, index) => cell || `字段${index + 1}`);
    const dataRows = rawRows.slice(headerIndex + 1);
    return {
      headers,
      rows: dataRows.slice(0, 30).map(row =>
        Object.fromEntries(headers.map((header, index) => [header, row[index] || '']))
      )
    };
  };
  const buildTableRecordText = (row: Record<string, string>, headers: string[]) => {
    const visibleHeaders = headers.filter(header => row[header]?.trim());
    if (step2TableParseConfig.conversionMode === 'markdown') {
      return [
        `| ${visibleHeaders.join(' | ')} |`,
        `| ${visibleHeaders.map(() => '---').join(' | ')} |`,
        `| ${visibleHeaders.map(header => row[header]).join(' | ')} |`
      ].join('\n');
    }
    const configuredFields = (step2TableParseConfig.descriptionFields || [])
      .map(field => field.header?.trim())
      .filter(Boolean);
    const targetHeaders = configuredFields.length > 0
      ? configuredFields.filter(header => headers.includes(header))
      : visibleHeaders;
    return (targetHeaders.length > 0 ? targetHeaders : visibleHeaders)
      .map(header => `${header}为${row[header] || '-'}`)
      .join('，');
  };
  const normalizeExtractedDocumentText = (text: string) =>
    text
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  const decodeXmlEntities = (value: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  };
  const decompressZipEntry = async (bytes: Uint8Array, method: number) => {
    if (method === 0) return bytes;
    if (method !== 8 || typeof DecompressionStream === 'undefined') {
      throw new Error('Unsupported zip compression');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  const readZipXmlEntries = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const minEocdOffset = Math.max(0, bytes.length - 0xffff - 22);
    let eocdOffset = -1;
    for (let offset = bytes.length - 22; offset >= minEocdOffset; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error('Invalid zip file');
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    const entryCount = view.getUint16(eocdOffset + 10, true);
    const entries: Record<string, string> = {};
    const decoder = new TextDecoder('utf-8');
    let offset = centralDirectoryOffset;
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      if (name.endsWith('.xml') && view.getUint32(localHeaderOffset, true) === 0x04034b50) {
        const localNameLength = view.getUint16(localHeaderOffset + 26, true);
        const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
        const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
        const decompressed = await decompressZipEntry(compressedBytes, method);
        entries[name] = decoder.decode(decompressed);
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  };
  const getXmlElements = (root: Document | Element, tagName: string, localName: string) => {
    const direct = Array.from(root.getElementsByTagName(tagName));
    if (direct.length > 0) return direct;
    return Array.from(root.getElementsByTagNameNS('*', localName));
  };
  const getXmlAttribute = (element: Element, localName: string) =>
    element.getAttribute(`w:${localName}`) ||
    element.getAttribute(localName) ||
    element.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', localName) ||
    '';
  const extractDocxTextFromEntries = (entries: Record<string, string>) => {
    const xml = entries['word/document.xml'];
    if (!xml) return '';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = getXmlElements(doc, 'w:p', 'p');
    return normalizeExtractedDocumentText(paragraphs.map((paragraph) => {
      const text = getXmlElements(paragraph, 'w:t', 't')
        .map(node => node.textContent || '')
        .join('');
      if (!text.trim()) return '';
      const style = getXmlElements(paragraph, 'w:pStyle', 'pStyle')
        .map(node => getXmlAttribute(node, 'val'))
        .find(Boolean) || '';
      const headingLevel = style.match(/(?:heading|标题)\s*([1-6])/i)?.[1];
      return headingLevel ? `${'#'.repeat(Number(headingLevel))} ${text}` : text;
    }).filter(Boolean).join('\n\n'));
  };
  const extractPptxTextFromEntries = (entries: Record<string, string>) => {
    const slideNames = Object.keys(entries)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));
    const slides = slideNames.map((name, index) => {
      const doc = new DOMParser().parseFromString(entries[name], 'application/xml');
      const text = getXmlElements(doc, 'a:t', 't')
        .map(node => node.textContent?.trim() || '')
        .filter(Boolean)
        .join('\n');
      return text ? `# 第 ${index + 1} 页\n\n${text}` : '';
    }).filter(Boolean);
    return normalizeExtractedDocumentText(slides.join('\n\n'));
  };
  const decodePdfLiteralString = (value: string) =>
    decodeXmlEntities(value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\'));
  const extractPdfPlainText = async (file: File) => {
    const raw = new TextDecoder('latin1').decode(await file.arrayBuffer());
    const parts: string[] = [];
    Array.from(raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)).forEach(match => {
      parts.push(decodePdfLiteralString(match[1]));
    });
    Array.from(raw.matchAll(/\[((?:.|\n)*?)\]\s*TJ/g)).forEach(match => {
      Array.from(match[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)).forEach(item => {
        parts.push(decodePdfLiteralString(item[1]));
      });
    });
    return normalizeExtractedDocumentText(parts.join(' ').replace(/\s{2,}/g, ' '));
  };
  const extractLegacyDocText = async (file: File) => {
    const bytes = await file.arrayBuffer();
    const decoders = ['utf-16le', 'gb18030', 'gbk', 'utf-8'];
    const candidates = decoders.map((encoding) => {
      try {
        const decoded = new TextDecoder(encoding).decode(bytes);
        const readable = decoded
          .replace(/[^\u4e00-\u9fa5A-Za-z0-9\s，。！？；：、（）()《》【】\[\]_.\-/%@+]/g, '\n')
          .split(/\n+/)
          .map(line => line.replace(/\s+/g, ' ').trim())
          .filter(line => line.length >= 2 && /[\u4e00-\u9fa5A-Za-z]/.test(line))
          .filter(line => !/^[A-Za-z0-9_.\-/%@+\s]{2,12}$/.test(line))
          .join('\n');
        const chineseScore = (readable.match(/[\u4e00-\u9fa5]/g) || []).length;
        const fieldScore = (readable.match(/[：:]/g) || []).length * 8;
        return { text: normalizeExtractedDocumentText(readable), score: chineseScore + fieldScore };
      } catch {
        return { text: '', score: 0 };
      }
    });
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    return best?.score > 20 ? best.text : '';
  };
  const readUploadFileContent = async (file: File) => {
    try {
      return await readUploadDocumentText(file);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '文件解析失败，无法生成真实原文和切片。');
    }
  };
  const cleanPreviewText = (text: string) => {
    let next = text;
    if (step2ReplaceSpaces) next = next.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
    if (step2RemoveUrls) next = next.replace(/https?:\/\/\S+/g, '').replace(/\S+@\S+\.\S+/g, '');
    return next.trim();
  };
  const decodeDelimiter = (value: string) =>
    value
      .replace(/\\r/g, '\r')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');
  const getReadableDelimiter = (value: string) =>
    value
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const splitTextWithDelimiter = (source: string, delimiter: string) => {
    const normalizedDelimiter = delimiter || '\n\n';
    if (normalizedDelimiter === '\n\n') {
      return source.split(/\n\s*\n+/).map(item => item.trim()).filter(Boolean);
    }
    if (normalizedDelimiter === '\n') {
      return source.split(/\n+/).map(item => item.trim()).filter(Boolean);
    }
    const shouldKeepDelimiter = !/^\s+$/.test(normalizedDelimiter);
    const delimiterPattern = new RegExp(`(${escapeRegExp(normalizedDelimiter)}+)`, 'g');
    const isDelimiterPart = new RegExp(`^${escapeRegExp(normalizedDelimiter)}+$`);
    const parts = source.split(delimiterPattern);
    const segments: string[] = [];
    let current = '';
    parts.forEach((part) => {
      if (!part) return;
      if (isDelimiterPart.test(part)) {
        if (shouldKeepDelimiter) {
          current += part;
        }
        if (current.trim()) segments.push(current.trim());
        current = '';
        return;
      }
      current += part;
    });
    if (current.trim()) segments.push(current.trim());
    return segments;
  };
  const splitBySmartDelimiter = (source: string) => {
    const delimiter = decodeDelimiter(step2SmartConfig.segmentDelimiter || '\\n\\n');
    return splitTextWithDelimiter(source, delimiter);
  };
  const chunkSmartSegments = (segments: string[]) => {
    const maxLength = Math.max(1, step2SmartConfig.maxLength || 1000);
    const overlap = Math.max(0, step2SmartConfig.overlap || 0);
    return segments.flatMap(segment => (
      segment.length > maxLength
        ? chunkWithOverlap(segment, maxLength, overlap)
        : [segment]
    )).filter(Boolean);
  };
  const getTitleDepthNumber = (depth: string) => (
    depth === '一级' ? 1 : depth === '二级' ? 2 : depth === '三级' ? 3 : 6
  );
  const normalizeTitleLine = (line: string) => line.replace(/\s+/g, ' ').trim();
  const getTitleLineInfo = (line: string) => {
    const trimmed = normalizeTitleLine(line);
    if (!trimmed || /^#\s*第\s*\d+\s*页$/.test(trimmed) || /^第\s*\d+\s*页$/.test(trimmed)) return null;
    const markdownHeading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (markdownHeading) {
      return { level: markdownHeading[1].length, title: markdownHeading[2].trim(), normalized: trimmed };
    }
    const numberedHeading = trimmed.match(/^((?:\d+|[一二三四五六七八九十]+)(?:[.、．]\d+){0,5}|第[一二三四五六七八九十\d]+[章节篇部分])[\s、.．-]+(.+)$/);
    if (numberedHeading && numberedHeading[2]?.trim().length >= 2 && trimmed.length <= 80) {
      const marker = numberedHeading[1];
      const level = marker.startsWith('第') ? 1 : Math.min(6, marker.split(/[.．、]/).filter(Boolean).length);
      return { level, title: numberedHeading[2].trim(), normalized: `${'#'.repeat(level)} ${trimmed}` };
    }
    return null;
  };
  const splitByTitleDepth = (source: string) => {
    const maxDepth = getTitleDepthNumber(step2TitleConfig.titleDepth);
    const lines = source.split(/\r?\n/).map(line => line.replace(/^---\s*第\s*\d+\s*页\s*---\s*$/, '').trimEnd());
    const sections: string[] = [];
    let current: string[] = [];
    let hasMatchedHeading = false;
    lines.forEach((line) => {
      const heading = getTitleLineInfo(line);
      if (heading && heading.level <= maxDepth) {
        if (current.some(item => item.trim())) {
          sections.push(current.join('\n').trim());
        }
        hasMatchedHeading = true;
        current = [heading.normalized];
      } else if (heading) {
        current.push(heading.normalized);
      } else {
        current.push(line);
      }
    });
    if (current.some(item => item.trim())) sections.push(current.join('\n').trim());
    return hasMatchedHeading && sections.length > 0 ? sections : chunkWithOverlap(source, step2TitleConfig.maxLength, step2TitleConfig.overlap);
  };
  const isImageDocument = (doc?: Pick<Document, 'format' | 'sourceType'> | null) =>
    doc?.sourceType === 'image' || ['PNG', 'JPG', 'JPEG', 'BMP'].includes(doc?.format?.toUpperCase?.() || '');
  const isAudioDocument = (doc?: Pick<Document, 'format' | 'sourceType'> | null) =>
    doc?.sourceType === 'audio' || ['MP3', 'WAV', 'M4A', 'AMR', 'MP4', 'MOV', 'AVI'].includes(doc?.format?.toUpperCase?.() || '');
  const isStructuredImageName = (name: string) => inferImageFileKind(name) === 'structured';
  const getImageAnalysisResult = (doc: Pick<Document, 'name' | 'previewUrl' | 'chunks' | 'ocrText' | 'ocrStatus' | 'imageVisionLabels' | 'imageVisionCaption' | 'imageVisionStatus'>): ImageAnalysisResult => {
    const existingChunks = doc.chunks?.filter(chunk => chunk.chunkType || chunk.sourceImage) as ImageKnowledgeChunk[] | undefined;
    if (existingChunks?.length && existingChunks.every(isSemanticImageChunk)) {
      return {
        imageType: existingChunks[0]?.metadata?.imageType === 'structured' ? 'structured' : 'unstructured',
        sourceImage: existingChunks[0]?.sourceImage || doc.previewUrl || doc.name,
        chunks: existingChunks
      };
    }
    return analyzeKnowledgeImage({
      name: doc.name,
      previewUrl: doc.previewUrl,
      ocrText: doc.ocrText,
      ocrStatus: doc.ocrStatus,
      visionLabels: doc.imageVisionLabels,
      visionCaption: doc.imageVisionCaption,
      visionStatus: doc.imageVisionStatus
    });
  };
  const getImageAnalysisChunks = (doc: Pick<Document, 'name' | 'previewUrl' | 'chunks' | 'ocrText' | 'ocrStatus' | 'imageVisionLabels' | 'imageVisionCaption' | 'imageVisionStatus'>) =>
    getImageAnalysisResult(doc).chunks;
  const formatImageChunkContent = (chunk: NonNullable<Document['chunks']>[number]) => {
    return [
      chunk.title || getImageChunkTypeLabel(chunk.chunkType || chunk.type || ''),
      chunk.content
    ].filter(Boolean).join('\n');
  };
  const parseAudioTranscriptContent = (content?: string) => {
    if (!content?.trim()) return [];
    const matches = Array.from(content.matchAll(/(?:^|\n)(\d{1,2}:\d{2}(?::\d{2})?)\s*\n([\s\S]*?)(?=\n{2,}\d{1,2}:\d{2}(?::\d{2})?\s*\n|$)/g));
    return matches
      .map(match => ({
        time: match[1],
        text: match[2].trim()
      }))
      .filter(segment => segment.text);
  };
  const getAudioTranscriptSegments = (doc: Pick<Document, 'name' | 'chunks' | 'content' | 'asrSegments' | 'asrText'>) => {
    if (doc.asrSegments?.length) {
      return doc.asrSegments
        .filter(segment => segment.text?.trim())
        .sort((a, b) => getSecondsFromTimestamp(a.time) - getSecondsFromTimestamp(b.time));
    }

    const chunkSegments = (doc.chunks || [])
      .filter(chunk => chunk.type === 'asr_segment' || chunk.metadata?.timestamp)
      .map((chunk, index) => ({
        time: String(chunk.metadata?.timestamp || formatPlaybackTime(index * 30)),
        text: chunk.content
      }))
      .filter(segment => segment.text?.trim())
      .sort((a, b) => getSecondsFromTimestamp(a.time) - getSecondsFromTimestamp(b.time));
    if (chunkSegments.length > 0) return chunkSegments;

    const contentSegments = parseAudioTranscriptContent(doc.asrText || doc.content);
    if (contentSegments.length > 0) return contentSegments;

    return [];
  };
  const isAudioUploadReady = (file: Pick<typeof uploadingFiles[number], 'name' | 'content' | 'asrText' | 'asrSegments' | 'asrStatus' | 'sourceType'>) => {
    if (file.sourceType !== 'audio') return true;
    return file.asrStatus === 'ready' && getAudioTranscriptSegments({
      name: file.name,
      content: file.content,
      asrText: file.asrText,
      asrSegments: file.asrSegments
    }).length > 0;
  };
  const retryAudioTranscription = (fileId: string) => {
    const target = uploadingFiles.find(file => file.id === fileId);
    if (!target?.rawFile || target.sourceType !== 'audio') {
      showToast('warning', '当前文件没有保留原始音视频，请重新上传后再转写');
      return;
    }

    setUploadingFiles(prev => prev.map(file => file.id === fileId ? {
      ...file,
      progress: 8,
      status: 'uploading' as const,
      content: '',
      parseNote: '正在重新进行音视频 ASR 转写...',
      asrStatus: 'processing' as const,
      asrMessage: '正在重新进行音视频 ASR 转写...',
      asrText: '',
      asrSegments: []
    } : file));

    void (async () => {
      try {
        const result = await transcribeAudioFile(target.rawFile, { languageMode: step2AudioParseConfig.languageMode });
        const content = result.status === 'ready' && result.segments.length > 0
          ? result.segments.map(segment => `${segment.time}\n${segment.text}`).join('\n\n')
          : '';
        setUploadingFiles(prev => prev.map(file => file.id === fileId ? {
          ...file,
          progress: 100,
          status: 'success' as const,
          content,
          parseNote: result.message,
          asrStatus: result.status,
          asrText: result.text,
          asrSegments: result.segments,
          asrMessage: result.message,
          asrProvider: result.provider
        } : file));
        if (result.status === 'ready' && result.segments.length > 0) {
          showToast('success', `${target.name} 已重新完成 ASR 转写`);
        } else {
          showToast('warning', result.message || `${target.name} 暂未生成可用转写文本`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ASR 转写失败，请稍后重试。';
        setUploadingFiles(prev => prev.map(file => file.id === fileId ? {
          ...file,
          progress: 100,
          status: 'success' as const,
          content: '',
          parseNote: message,
          asrStatus: 'failed' as const,
          asrText: '',
          asrSegments: [],
          asrMessage: message
        } : file));
        showToast('error', message);
      }
    })();
  };
  const getSecondsFromTimestamp = (timestamp: string) => {
    const parts = timestamp.split(':').map(Number).filter(value => Number.isFinite(value));
    if (parts.length >= 3) {
      const [hours, minutes, seconds] = parts.slice(-3);
      return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
    }
    const [minutes, seconds] = parts;
    return (minutes || 0) * 60 + (seconds || 0);
  };
  const formatPlaybackTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const restSeconds = safeSeconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
  };
  const buildStep2PreviewChunks = (file?: { name: string; content?: string }) => {
    const source = cleanPreviewText(file?.content || '');
    if (!source) return [];
    if (step2SliceMethod === 'title') {
      const sections = splitByTitleDepth(source);
      return chunkSegmentsByLength(sections, step2TitleConfig.maxLength, step2TitleConfig.overlap);
    }
    if (step2SliceMethod === 'record') {
      const qaPairs = Array.from(source.matchAll(/问题[:：]\s*([^\n]+)\n+答案[:：]\s*([\s\S]*?)(?=\n+问题[:：]|$)/g));
      const records = qaPairs.length > 0
        ? qaPairs.map(match => `${step2RecordConfig.keepFieldNames ? '问题：' : ''}${match[1].trim()}\n${step2RecordConfig.keepFieldNames ? '答案：' : ''}${match[2].trim()}`)
        : source.split(/\n{2,}|(?=^\d+[.、]\s+)/gm).filter(item => item.trim());
      return records.flatMap(record => chunkWithOverlap(record, step2RecordConfig.maxLength, step2RecordConfig.overlap));
    }
    if (step2SliceMethod === 'page') {
      const pages = source.split(/---\s*第\s*\d+\s*页\s*---/).filter(item => item.trim());
      const pageChunks = pages.length > 1 ? pages : chunkWithOverlap(source, step2PageConfig.pageMaxLength, step2PageConfig.pageOverlap);
      return pageChunks.flatMap((page, index) => {
        const prefix = step2PageConfig.keepPageNumber ? `来源：第 ${index + 1} 页\n` : '';
        return chunkWithOverlap(`${prefix}${page.trim()}`, step2PageConfig.pageMaxLength, step2PageConfig.pageOverlap);
      });
    }
    const segments = splitBySmartDelimiter(source);
    return chunkSmartSegments(segments.length > 0 ? segments : [source]);
  };
  const getStep2SliceRuleText = () => {
    if (fileUploadFileType === 'text') {
      if (step2SliceMethod === 'title') {
        return `按标题切分：${step2TitleConfig.titleDepth}标题 / 最大 ${step2TitleConfig.maxLength} 字符 / 重叠 ${step2TitleConfig.overlap} 字符`;
      }
      return `智能切片：标识符 ${getReadableDelimiter(decodeDelimiter(step2SmartConfig.segmentDelimiter || '\\n\\n'))} / 最大 ${step2SmartConfig.maxLength} 字符 / 重叠 ${step2SmartConfig.overlap} 字符`;
    }
    return `${selectedStep2SliceMethod.title}：${getStep2ChunkSummary()}`;
  };
  const buildStep2PreviewItems = (file?: { name: string; content?: string; sourceUrl?: string; parseNote?: string; size?: number; previewUrl?: string; ocrText?: string; ocrStatus?: ImageOcrResult['status']; imageVisionStatus?: ImageVisionResult['status']; imageVisionLabels?: ImageVisionLabel[]; imageVisionCaption?: string; asrStatus?: AudioTranscriptionResult['status']; asrText?: string; asrSegments?: AudioTranscriptSegment[]; asrMessage?: string }) => {
    if (fileUploadFileType === 'web') {
      const fileName = file?.name || file?.sourceUrl || '网页内容';
      const cleanedContent = cleanPreviewText(file?.content || createFallbackWebContent(file?.sourceUrl || fileName));
      const extractedText = buildStep2PreviewChunks({
        name: fileName,
        content: cleanedContent
      });
      return [
        `来源网页：${fileName}\n解析方式：${step2WebParseConfig.parseMode === 'main' ? '自动提取正文' : '提取全部文字'}\n编码识别：自动识别\n${file?.parseNote || '网页正文已进入文本预处理流程。'}`,
        `网页提取配置\n内容清洗：${step2WebParseConfig.removeScriptsAndStyles ? '移除脚本与样式代码' : '保留脚本与样式代码'}；${step2WebParseConfig.removeChrome ? '移除导航栏、页脚、侧边栏等非正文内容' : '保留页面外围内容'}\n保留信息：${step2WebParseConfig.keepPageTitle ? '页面标题' : '不保留页面标题'}`,
        ...extractedText
      ];
    }
    if (fileUploadFileType === 'audio') {
      const fileName = file?.name || '音频文件.mp3';
      const segments = getAudioTranscriptSegments({
        name: fileName,
        content: file?.content,
        asrText: file?.asrText,
        asrSegments: file?.asrSegments
      });
      if (segments.length > 0) {
        return [
          `来源音视频：${fileName}\n解析规则：浏览器端 ASR 自动转写\n处理结果：已生成时间戳文本，点击详情页文本可定位播放节点。`,
          ...segments.map(segment => `${segment.time}\n${segment.text}`)
        ];
      }
      return [
        `来源音视频：${fileName}\n解析规则：ASR 自动转写`,
        file?.asrStatus === 'processing'
          ? 'ASR 正在转写中，完成后会显示真实时间戳文本。'
          : file?.asrMessage || file?.parseNote || '暂未生成真实转写文本，请上传包含清晰人声的音视频文件，或配置后端 ASR 服务后重试。'
      ];
    }
    if (isStep2GenericSliceType) {
      return buildStep2PreviewChunks(file);
    }
    if (fileUploadFileType === 'table') {
      const fileName = file?.name || '表格型知识.xlsx';
      const parsedTable = parseTableRowsFromText(file?.content || '');
      const parseRule = step2TableParseConfig.parseMode === 'whole'
        ? '整表聚合'
        : '逐行提取';
      const headerRule = step2TableParseConfig.headerDetection === 'auto'
        ? '自动识别首行'
        : `指定第 ${step2TableParseConfig.headerRow} 行为表头`;
      const templateRule = (step2TableParseConfig.descriptionFields || [])
        .filter(item => item.header?.trim() || item.value?.trim())
        .map(item => `${item.header || '表头'}为${item.value || '值'}`)
        .join('，') || step2TableParseConfig.descriptionTemplate;
      const conversionRule = step2TableParseConfig.conversionMode === 'markdown'
        ? '保留原始表格结构'
        : `转换为自然语言描述：${templateRule}`;
      const mergeRule = step2TableParseConfig.mergeStrategy === 'primaryKey'
        ? `按主键合并（${step2TableParseConfig.primaryKeyField || '未指定主键'}）`
        : '每行独立';
      const dataItems = parsedTable.rows.length > 0
        ? parsedTable.rows.map(row => buildTableRecordText(row, parsedTable.headers)).filter(Boolean)
        : [];
      const records = step2TableParseConfig.parseMode === 'whole'
        ? [`整表聚合结果\n${dataItems.join('\n')}`]
        : dataItems;
      const mergedRecords = step2TableParseConfig.mergeStrategy === 'primaryKey' && step2TableParseConfig.primaryKeyField
        ? Object.entries(records.reduce<Record<string, string[]>>((acc, record, index) => {
            const sourceRow = parsedTable.rows[index] || {};
            const key = sourceRow[step2TableParseConfig.primaryKeyField] || `记录${index + 1}`;
            acc[key] = [...(acc[key] || []), record];
            return acc;
          }, {})).map(([key, values]) => `${step2TableParseConfig.primaryKeyField}：${key}\n${values.join('\n')}`)
        : records;
      return [
        `来源文件：${fileName}\n解析方式：${parseRule}\n表头识别：${headerRule}\n空行处理：${step2TableParseConfig.skipEmptyRows ? '自动跳过全空行' : '保留空行'}\n${file?.parseNote || '已按表格解析规则生成记录预览。'}`,
        `结构化转换\n转换方式：${conversionRule}\n多行合并策略：${mergeRule}\n识别字段：${parsedTable.headers.join('、') || '待后端解析'}`,
        ...mergedRecords.slice(0, 20)
      ];
    }
    if (fileUploadFileType === 'image') {
      const fileName = file?.name || '图片文件.png';
      return getImageAnalysisChunks({
        name: fileName,
        previewUrl: file?.previewUrl,
        ocrText: file?.ocrText || file?.content,
        ocrStatus: file?.ocrStatus,
        imageVisionLabels: file?.imageVisionLabels,
        imageVisionCaption: file?.imageVisionCaption,
        imageVisionStatus: file?.imageVisionStatus
      })
        .map(formatImageChunkContent);
    }
    return [];
  };
  const getCurrentStep2PreviewFile = () => {
    const successFiles = uploadingFiles.filter(f => f.status === 'success');
    return successFiles[step2PreviewFileIndex] || successFiles[0];
  };
  const createStep2PreviewEntries = (file?: { name: string; content?: string; sourceUrl?: string; parseNote?: string; size?: number; previewUrl?: string; ocrText?: string; ocrStatus?: ImageOcrResult['status']; imageVisionStatus?: ImageVisionResult['status']; imageVisionLabels?: ImageVisionLabel[]; imageVisionCaption?: string; asrStatus?: AudioTranscriptionResult['status']; asrText?: string; asrSegments?: AudioTranscriptSegment[]; asrMessage?: string }) => {
    const prefix = fileUploadFileType === 'table'
      ? 'table-preview'
      : fileUploadFileType === 'image'
        ? 'image-preview'
        : 'chunk';
    return buildStep2PreviewItems(file)
      .slice(0, 20)
      .map((content, index) => ({
        id: `${prefix}-${index + 1}`,
        content
      }));
  };
  const refreshStep2Preview = (file = getCurrentStep2PreviewFile()) => {
    const previewChunks = createStep2PreviewEntries(file);
    setStep2PreviewChunks(previewChunks);
    setStep2ShowPreview(true);
  };
  useEffect(() => {
    if (fileUploadStep !== 2 || uploadingFiles.filter(file => file.status === 'success').length === 0) return;
    refreshStep2Preview();
  }, [fileUploadStep, step2PreviewFileIndex]);
  useEffect(() => {
    if (fileUploadStep !== 2 || !step2ShowPreview) return;
    refreshStep2Preview();
  }, [
    fileUploadFileType,
    step2SliceMethod,
    step2SmartConfig,
    step2TitleConfig,
    step2RecordConfig,
    step2PageConfig,
    step2TableParseConfig,
    step2ImageQaConfig,
    step2AudioParseConfig,
    step2WebParseConfig,
    step2ReplaceSpaces,
    step2RemoveUrls
  ]);
  const getStep2PreviewLabel = () => {
    if (fileUploadFileType === 'table') return '解析预览';
    if (fileUploadFileType === 'image') return '图片切片预览';
    return '切片预览';
  };
  const getStep2PreviewEmptyText = () => {
    if (fileUploadFileType === 'table') return '点击左侧的"生成预览"查看表格解析效果';
    if (fileUploadFileType === 'image') return '上传图片后可查看 OCR 识别与图片切片预览';
    return '点击左侧的"预览块"按钮来加载预览';
  };
  const generateFileUploadTags = (
    sourceType: typeof fileUploadFileType,
    sources: Array<{ name?: string; url?: string; content?: string }>,
    variant = 0
  ) => {
    const text = sources
      .map(source => `${source.name || ''} ${source.url || ''} ${source.content || ''}`)
      .join(' ')
      .toLowerCase();
    const candidates: string[] = [];
    const add = (tag: string) => {
      if (!candidates.includes(tag)) candidates.push(tag);
    };

    const sourceTypeTags = {
      text: ['文本文档', '文档资料', '知识资料'],
      table: ['表格知识', '结构化数据', '业务数据'],
      image: ['图片问答', '图片资料', 'OCR识别'],
      audio: ['音频转写', '音频资料', '会议记录'],
      web: ['网页资料', '网页正文', '外部资料']
    } as const;
    if (!text.trim()) {
      sourceTypeTags[sourceType].forEach(add);
    }

    if (/\.(pdf|doc|docx|md|txt|ppt|pptx)\b/.test(text)) ['文档资料', '知识文档', '文件入库'].forEach(add);
    if (/\.(xls|xlsx|csv|json)\b/.test(text)) ['结构化数据', '表格知识', '数据清单'].forEach(add);
    if (/\.(png|jpg|jpeg|bmp)\b/.test(text)) ['图片资料', 'OCR识别', '视觉资料'].forEach(add);
    if (/\.(mp3|wav|m4a|amr)\b/.test(text)) ['音频资料', '音频转写', '语音内容'].forEach(add);
    if (/(api|接口|sdk|swagger|openapi)/i.test(text)) ['API文档', '接口资料', '技术文档'].forEach(add);
    if (/(prd|需求|产品|手册|指南|说明|操作|使用)/i.test(text)) ['产品手册', '使用指南', '需求资料'].forEach(add);
    if (/(培训|教程|课程|学习|lesson|training)/i.test(text)) ['培训材料', '学习资料', '课程内容'].forEach(add);
    if (/(内部|制度|规范|流程|管理办法|政策|规章)/i.test(text)) ['内部资料', '制度流程', '规范文件'].forEach(add);
    if (/(faq|问答|问题|客服|q&a)/i.test(text)) ['常见问题', '问答知识', '客服资料'].forEach(add);
    if (/(技术|架构|方案|开发|代码|工程|前端|后端|数据库)/i.test(text)) ['技术文档', '技术方案', '工程资料'].forEach(add);

    const fallbackTags = text.trim()
      ? ['知识资料', '可检索资料', '业务知识', '知识条目', '共享资料']
      : sourceTypeTags[sourceType];
    fallbackTags.forEach(add);
    const offset = candidates.length > 0 ? variant % candidates.length : 0;
    return [...candidates.slice(offset), ...candidates.slice(0, offset)].slice(0, MAX_AUTO_FILE_TAGS);
  };
  
  // 文件标签配置状态
  const [fileUploadTags, setFileUploadTags] = useState<string[]>([]);
  const [autoGeneratedFileTags, setAutoGeneratedFileTags] = useState<string[]>([]);
  const [fileUploadTagGenerationCount, setFileUploadTagGenerationCount] = useState(0);
  const [fileUploadTagInput, setFileUploadTagInput] = useState('');
  useEffect(() => {
    if (autoGeneratedFileTags.length <= MAX_AUTO_FILE_TAGS) return;
    const trimmedAutoTags = autoGeneratedFileTags.slice(0, MAX_AUTO_FILE_TAGS);
    setAutoGeneratedFileTags(trimmedAutoTags);
    setFileUploadTags(prev => {
      const manualTags = prev.filter(tag => !autoGeneratedFileTags.includes(tag));
      return Array.from(new Set([...manualTags, ...trimmedAutoTags]));
    });
  }, [autoGeneratedFileTags]);
  
  // 文件解析配置状态
  const [fileParseConfig, setFileParseConfig] = useState({
    sliceMethod: 'smart' as 'smart' | 'length' | 'regex' | 'page' | 'title' | 'custom',
    // 智能切片配置
    smartMaxLength: 800,
    smartOverlap: 100,
    // 长度切片配置
    lengthMaxSize: 800,
    lengthOverlap: 100,
    // 正则切片配置
    regexPattern: '\\n\\n',
    regexMaxLength: 1000,
    // 按页切片配置
    pagesPerChunk: 1,
    mergeShortPages: true,
    // 按标题切片配置
    titleLevel: 1,
    titleMaxLength: 1000,
    // 自定义切片配置
    customSeparator: '。',
    customKeepSeparator: false,
    customMaxLength: 800
  });
  const [showSlicePreview, setShowSlicePreview] = useState(false); // 切片预览模态框
  const [slicePreviewData, setSlicePreviewData] = useState<Array<{id: string, content: string, charCount: number}>>([]);
  
  // OCR配置状态
  const [ocrConfig, setOcrConfig] = useState({
    enabled: false,
    scanPdfRecognition: true,
    language: 'zh-CN' as 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR' | 'auto'
  });
  const [showOcrRecommendation, setShowOcrRecommendation] = useState(false); // OCR推荐提示
  
  // Metadata配置状态
  const [metadataConfig, setMetadataConfig] = useState<Array<{key: string, value: string}>>([
    { key: 'source', value: '' },
    { key: 'author', value: '' },
    { key: 'department', value: '' }
  ]);
  const [metadataInput, setMetadataInput] = useState({ key: '', value: '' });
  
  // 文本增强配置状态
  const [textEnhanceConfig, setTextEnhanceConfig] = useState({
    preserveMarkdown: false,
    enhanceTable: false,
    removeHeaderFooter: false,
    extractImageText: false
  });
  
  // 导入流程状态
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 6,
    stage: '' as 'ocr' | 'cleaning' | 'chunking' | 'metadata' | 'vectorizing' | 'writing' | '',
    message: ''
  });
  const [processingFileProgress, setProcessingFileProgress] = useState<Record<string, number>>({});
  const [showPageSizeDropdown, setShowPageSizeDropdown] = useState(false); // 新增：每页条数下拉菜单
  const [pageJumpInput, setPageJumpInput] = useState(''); // 新增：页面跳转输入
  const [showDocConfigModal, setShowDocConfigModal] = useState(false); // 新增：文档配置修改模态框
  const [editingDoc, setEditingDoc] = useState<Document | null>(null); // 新增：正在编辑的文档
  
  // 文档配置状态
  const [docConfig, setDocConfig] = useState({
    // 托管切片
    storageResource: 'default',
    vectorModel: 'v4',
    // 导入文件源头
    importMethod: 'upload',
    fileTypes: [] as string[],
    importSource: 'local',
    selectedTags: [] as string[],
    // 配置解析策略
    textExtraction: true,
    layoutAnalysis: true,
    ocrEnabled: true,
    // 切片策略
    sliceMethod: 'smart',
    sliceConfig: {
      smartMaxLength: 1000,
      maxLength: 1000,
      lengthOverlap: 100,
      titleMaxLength: 1000,
      titleLevel: 1,
      regexPattern: '',
      regexMaxLength: 1000,
      regexFlags: 'g',
      pagesPerChunk: 1,
      mergeShortPages: true,
      separator: '。',
      keepSeparator: false
    }
  });
  // 文件上传处理函数
  const handleFileUpload = async (files: File[]) => {
    const existingNames = uploadingFiles.map(file => file.name.trim().toLowerCase());
    const seenBatchNames: string[] = [];
    const pendingFiles = files.map((file, index) => {
      const uploadOrder = uploadingFiles.length + index + 1;
      const validationReason = validateUploadFile(file, fileUploadFileType, existingNames, seenBatchNames);
      const demoProblemReason = uploadOrder === 3
        ? '原型演示：第 3 个上传文件模拟为问题文件，用于展示异常原因的悬停查看效果。'
        : '';
      const problemReason = validationReason || demoProblemReason;
      seenBatchNames.push(file.name.trim().toLowerCase());
      return {
        rawFile: file,
        id: `file-${Date.now()}-${Math.random()}`,
        name: file.name,
        size: file.size,
        progress: problemReason ? 0 : 0,
        status: problemReason ? 'error' as const : 'uploading' as const,
        sourceType: fileUploadFileType,
        previewUrl: !problemReason && (fileUploadFileType === 'image' || fileUploadFileType === 'audio') ? URL.createObjectURL(file) : undefined,
        problemReason,
      parseNote: problemReason
        ? problemReason
        : fileUploadFileType === 'image'
          ? '正在进行图片 OCR 与可见内容识别...'
          : fileUploadFileType === 'audio'
            ? '文件已上传，正在后台进行音视频 ASR 转写...'
            : '正在读取文件内容...'
      };
    });
    const newFiles = pendingFiles.map(file => ({
      rawFile: file.rawFile,
      id: file.id,
      name: file.name,
      size: file.size,
      progress: file.progress,
      status: file.status,
      sourceType: file.sourceType,
      content: file.content,
      previewUrl: file.previewUrl,
      parseNote: file.parseNote,
      problemReason: file.problemReason,
      asrStatus: file.sourceType === 'audio' && file.status !== 'error' ? 'processing' as const : undefined,
      asrMessage: file.sourceType === 'audio' && file.status !== 'error' ? '正在后台快速转写音视频内容...' : undefined,
      imageVisionStatus: file.sourceType === 'image' && file.status !== 'error' ? 'empty' as const : undefined
    }));
    
    setUploadingFiles(prev => [...prev, ...newFiles]);
    const tagSourceFiles = newFiles.filter(file => file.status !== 'error');
    if (tagSourceFiles.length > 0) {
      const autoTags = generateFileUploadTags(fileUploadFileType, tagSourceFiles.map(file => ({ name: file.name, content: file.content })), fileUploadTagGenerationCount);
      setAutoGeneratedFileTags(autoTags);
      setFileUploadTags(prev => {
        const manualTags = prev.filter(tag => !autoGeneratedFileTags.includes(tag));
        return Array.from(new Set([...manualTags, ...autoTags]));
      });
    }
    
    pendingFiles.filter(file => file.status !== 'error').forEach((file) => {
      let progress = 5;
      const interval = setInterval(() => {
        const cap = file.sourceType === 'audio' || file.sourceType === 'image' ? 92 : 98;
        progress = Math.min(cap, progress + Math.random() * 18);
        setUploadingFiles(prev =>
          prev.map(f => f.id === file.id ? {
            ...f,
            progress: Math.floor(progress),
            status: f.status
          } : f)
        );
      }, 500);

      void (async () => {
        try {
          const [ocrResult, imageVisionResult] = file.sourceType === 'image'
            ? await Promise.all([
                recognizeImageText(file.rawFile, step2ImageQaConfig.ocrLanguageMode),
                recognizeImageVisualContent(file.rawFile)
              ])
            : [null, null] as const;
          const asrResult = file.sourceType === 'audio'
            ? await transcribeAudioFile(file.rawFile, { languageMode: step2AudioParseConfig.languageMode })
            : null;
          const readableContent = file.sourceType === 'image'
            ? {
                  content: ocrResult?.text || '',
                  parseNote:
                    [
                      ocrResult?.status === 'ready'
                        ? `OCR 已识别 ${ocrResult.text.length} 个字符${typeof ocrResult.confidence === 'number' ? `，置信度约 ${Math.round(ocrResult.confidence)}%` : ''}。`
                        : ocrResult?.message || '未识别到清晰文字。',
                      imageVisionResult?.status === 'ready'
                        ? imageVisionResult.caption
                          ? `图像理解已生成整图描述，并获得 ${imageVisionResult.labels.length} 个可见内容标签。`
                          : `图像识别已获得 ${imageVisionResult.labels.length} 个可见内容标签。`
                        : imageVisionResult?.message
                    ].filter(Boolean).join(' ')
                }
            : file.sourceType === 'audio'
              ? {
                  content: asrResult?.status === 'ready' && asrResult.segments?.length
                    ? asrResult.segments.map(segment => `${segment.time}\n${segment.text}`).join('\n\n')
                    : '',
                  parseNote:
                    asrResult?.status === 'ready'
                      ? asrResult.message || `ASR 已生成 ${asrResult.segments.length} 个时间片段。`
                      : asrResult?.message || 'ASR 未生成真实转写文本，请检查音频清晰度或配置后端 ASR 服务。'
              }
              : await readUploadFileContent(file.rawFile);

          clearInterval(interval);
          setUploadingFiles(prev =>
            prev.map(f => f.id === file.id ? {
              ...f,
              ...readableContent,
              progress: 100,
              status: 'success',
              ocrStatus: ocrResult?.status,
              ocrText: ocrResult?.text,
              ocrConfidence: ocrResult?.confidence,
              ocrMessage: ocrResult?.message,
              imageVisionStatus: imageVisionResult?.status,
              imageVisionLabels: imageVisionResult?.labels,
              imageVisionCaption: imageVisionResult?.caption,
              imageVisionMessage: imageVisionResult?.message,
              imageVisionProvider: imageVisionResult?.provider,
              asrStatus: asrResult?.status,
              asrText: asrResult?.text,
              asrSegments: asrResult?.segments,
              asrMessage: asrResult?.message,
              asrProvider: asrResult?.provider
            } : f)
          );
        } catch (error) {
          clearInterval(interval);
          setUploadingFiles(prev =>
            prev.map(f => {
              if (f.id !== file.id) return f;
              const message = error instanceof Error ? error.message : '文件解析失败，请重新上传。';
              if (file.sourceType === 'image') {
                return {
                  ...f,
                  progress: 100,
                  status: 'success',
                  parseNote: message,
                  ocrStatus: 'failed' as const,
                  ocrMessage: message,
                  imageVisionStatus: 'failed' as const,
                  imageVisionMessage: message
                };
              }
              if (file.sourceType === 'audio') {
                return {
                  ...f,
                  content: '',
                  progress: 100,
                  status: 'success',
                  parseNote: message,
                  asrStatus: 'failed' as const,
                  asrMessage: message,
                  asrSegments: [],
                  asrText: ''
                };
              }
              return {
                ...f,
                progress: 0,
                status: 'error',
                problemReason: message,
                parseNote: message,
                ...(file.sourceType === 'audio' ? { asrStatus: 'failed' as const, asrMessage: message } : {})
              };
            })
          );
        }
      })();
    });
  };

  // 第二步：文本段落与清洗的状态
  const [parseStrategy, setParseStrategy] = useState({
    textExtraction: true,
    layoutAnalysis: true,
    ocr: true
  });
  const [sliceMethod, setSliceMethod] = useState<'smart' | 'length' | 'title' | 'regex' | 'page' | 'symbol'>('smart');
  const [sliceConfig, setSliceConfig] = useState({
    // 智能切片
    smartMaxLength: 1000,
    // 按长度切分
    maxLength: 1000,
    lengthOverlap: 100,
    // 按标题切分
    titleMaxLength: 1000,
    titleLevel: 1,
    // 按正则切分
    regexPattern: '',
    regexMaxLength: 1000,
    regexFlags: 'g',
    // 按页切分
    pagesPerChunk: 1,
    mergeShortPages: true,
    // 按符号切分
    separator: '。',
    keepSeparator: false
  });
  const [cleaningOptions, setCleaningOptions] = useState({
    removeExtraSpaces: true,
    removeSpecialChars: true,
    removeUrls: true,
    removeEmptyLines: false
  });
  const [showPreview, setShowPreview] = useState(false); // 控制预览显示
  
  // 第三步：检索设置的状态
  const [searchMode, setSearchMode] = useState<'hybrid' | 'vector' | 'fulltext'>('hybrid');
  const [vectorModel, setVectorModel] = useState('v4');
  const [rankModel, setRankModel] = useState('qwen3');
  const [vectorStorage, setVectorStorage] = useState('default');
  const [retrievalConfig, setRetrievalConfig] = useState({
    vectorTopK: 10,
    keywordTopK: 10,
    similarityThreshold: 0.01,
    maxRecall: 6
  });
  
  const [newKB, setNewKB] = useState({
    name: '',
    description: '',
    type: 'PDF' as KnowledgeBase['type'],
    category: '通用知识库' as KnowledgeBase['category'], // 新增：知识库类型
    dataSource: 'upload' as 'upload' | 'custom' | 'website' | 'api',
    tags: [] as string[],
    newTag: '',
    uploadedFiles: [] as string[],
    iconColor: '#3b82f6' // 图标颜色
  });
  
  // 新增状态
  const [filterType, setFilterType] = useState<'all' | 'favorites' | string>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editingKB, setEditingKB] = useState<KnowledgeBase | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUserSettingsMenuOpen, setIsUserSettingsMenuOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState(''); // 删除确认输入框
  const [kbViewMode, setKbViewMode] = useState<'card' | 'list'>('card');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [formatSearchQuery, setFormatSearchQuery] = useState('');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  
  // 新增：排序和筛选状态
  const [sortBy, setSortBy] = useState<'lastModified' | 'createdTime' | 'docsCount'>('lastModified');
  const [permissionFilter, setPermissionFilter] = useState<'all' | 'private' | 'public'>('all');
  
  // 新增：检索偏好和高级配置状态
  const [retrievalPreference, setRetrievalPreference] = useState<'precise' | 'balanced' | 'recall'>('balanced');
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  // 知识库文件格式选项
  const fileFormats = ['PDF', 'DOCX', 'TXT', 'MD', 'HTML', 'JSON', 'YAML', 'CSV', 'XLSX', 'PNG', 'JPG', 'AI', 'SH', 'LOG'];

  // 获取所有标签
  const allTags = Array.from(new Set(knowledgeBases.flatMap(kb => kb.tags)));

  // 筛选文件格式和标签
  const filteredFormats = fileFormats.filter(format => 
    format.toLowerCase().includes(formatSearchQuery.toLowerCase())
  );
  
  const filteredTags = allTags.filter((tag: string) => 
    tag.toLowerCase().includes(tagSearchQuery.toLowerCase())
  );

  // 计算相对时间
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffMins < 1) return '刚刚';
    if (diffMins === 1) return '一分钟前';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours === 1) return '一个小时前';
    if (diffHours < 24) return `${diffHours}个小时前`;
    if (diffDays === 1) return '一天前';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 14) return '一周前';
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    if (diffMonths === 1) return '一个月前';
    if (diffMonths < 12) return `${diffMonths}个月前`;
    if (diffYears === 1) return '一年前';
    return `${diffYears}年前`;
  };

  // 获取文件类型图标 - 优化设计
  const getFileTypeIcon = (type: string) => {
    const iconSize = "w-4 h-4";
    
    switch (type.toUpperCase()) {
      case 'PDF':
        return <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center"><FileText className={`${iconSize} text-red-600`} /></div>;
      case 'DOCX':
      case 'DOC':
        return <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center"><FileText className={`${iconSize} text-blue-600`} /></div>;
      case 'PNG':
      case 'JPG':
      case 'JPEG':
        return <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center"><Image className={`${iconSize} text-purple-600`} /></div>;
      case 'MP4':
      case 'AVI':
        return <div className="w-10 h-10 bg-pink-50 rounded-lg flex items-center justify-center"><Video className={`${iconSize} text-pink-600`} /></div>;
      case 'TXT':
      case 'MD':
        return <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center"><FileText className={`${iconSize} text-slate-600`} /></div>;
      case 'HTML':
        return <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center"><Code className={`${iconSize} text-orange-600`} /></div>;
      case 'JSON':
      case 'YAML':
      case 'XML':
        return <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center"><Code className={`${iconSize} text-green-600`} /></div>;
      case 'CSV':
      case 'XLSX':
      case 'XLS':
        return <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center"><FileText className={`${iconSize} text-emerald-600`} /></div>;
      case 'SH':
        return <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center"><Code className={`${iconSize} text-gray-600`} /></div>;
      case 'LOG':
        return <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center"><FileText className={`${iconSize} text-amber-600`} /></div>;
      case 'AI':
        return <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center"><Image className={`${iconSize} text-indigo-600`} /></div>;
      default:
        return <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center"><File className={`${iconSize} text-slate-600`} /></div>;
    }
  };

  // 时间格式化函数 - 显示为"xx之前"
  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString.replace(/-/g, '/'));
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffMonths = Math.floor(diffDays / 30);
      const diffYears = Math.floor(diffDays / 365);

      if (diffMinutes < 1) {
        return '刚刚';
      } else if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`;
      } else if (diffHours < 24) {
        return `${diffHours}小时前`;
      } else if (diffDays < 30) {
        return `${diffDays}天前`;
      } else if (diffMonths < 12) {
        return `${diffMonths}个月前`;
      } else {
        return `${diffYears}年前`;
      }
    } catch (error) {
      return dateString;
    }
  };

  // Toast 提示函数
  const showToast = (type: 'success' | 'error' | 'warning' | 'info', message: string, duration: number = 3000) => {
    const id = Date.now().toString();
    const newToast: Toast = { id, type, message, duration };
    setToasts(prev => [...prev, newToast]);
    
    // 自动移除 toast
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };

  // 移除 toast
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 获取文件类别 - 简化为三大类：文档、图片、数据
  const getFileCategory = (type: string): string => {
    // 文档类：PDF、Word、文本、Markdown、HTML等
    if (['PDF', 'DOCX', 'TXT', 'MD', 'DOC', 'HTML', 'HTM', 'XML'].includes(type)) return 'document';
    // 图片类：图片、视频、设计文件等
    if (['PNG', 'JPG', 'JPEG', 'GIF', 'SVG', 'AI', 'PSD', 'MP4', 'AVI', 'MOV', 'WMV', 'FLV'].includes(type)) return 'image';
    // 数据类：JSON、YAML、CSV、Excel、代码、脚本、日志等
    if (['JSON', 'YAML', 'CSV', 'XLSX', 'XLS', 'SH', 'LOG', 'JS', 'TS', 'PY', 'JAVA'].includes(type)) return 'data';
    return 'document'; // 默认归为文档类
  };

  // 获取类别图标 - 三大类：文档、图片、数据
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'document':
        return <FileText className="w-3.5 h-3.5 text-slate-500" />;
      case 'image':
        return <Image className="w-3.5 h-3.5 text-slate-500" />;
      case 'data':
        return <Database className="w-3.5 h-3.5 text-slate-500" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const getDocumentCallCount = (doc: Document) => {
    if (typeof doc.callCount === 'number') return doc.callCount;

    const idScore = doc.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return (idScore * 17 + doc.charCount) % 1000;
  };

  const downloadDocument = (doc: Document) => {
    const content = [
      `文件名称: ${doc.name}`,
      `文件ID: ${doc.fileId || doc.id}`,
      `格式: ${doc.format.toUpperCase()}`,
      `字符数: ${doc.charCount}`,
      `标签: ${doc.tags.join(', ') || '无'}`,
      `更新时间: ${doc.lastEdited}`,
      doc.sliceRule ? `切片规则: ${doc.sliceRule}` : '',
      '',
      doc.content || doc.summary || '当前为演示文件下载内容。实际接入后可替换为原始文件流。'
    ].filter(Boolean).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('success', '文件下载已开始');
  };

  const renameDocument = () => {
    if (!renamingDoc) return;

    const nextName = renameDocName.trim();
    if (!nextName) {
      showToast('error', '请输入文件名称');
      return;
    }

    setKnowledgeBases(prev => prev.map(kb =>
      kb.id === selectedKB?.id
        ? {
            ...kb,
            documents: kb.documents.map(doc =>
              doc.id === renamingDoc.id ? { ...doc, name: nextName } : doc
            )
          }
        : kb
    ));

    if (selectedKB) {
      setSelectedKB({
        ...selectedKB,
        documents: selectedKB.documents.map(doc =>
          doc.id === renamingDoc.id ? { ...doc, name: nextName } : doc
        )
      });
    }

    if (selectedDocument?.id === renamingDoc.id) {
      setSelectedDocument({ ...selectedDocument, name: nextName });
    }

    setShowRenameDocModal(false);
    setRenamingDoc(null);
    setRenameDocName('');
    showToast('success', '文件已重命名');
  };

  // 按类别分组文档类型
  const groupDocumentsByCategory = (documentTypes: { type: string; count: number }[]) => {
    const categoryMap: Record<string, number> = {};
    
    documentTypes.forEach(doc => {
      const category = getFileCategory(doc.type);
      categoryMap[category] = (categoryMap[category] || 0) + doc.count;
    });
    
    return Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count
    }));
  };

  const handleCreateKB = () => {
    if (!newKB.name || !newKB.dataSource) return;

    // 根据数据源类型生成示例文档类型
    const generateDocTypes = () => {
      switch (newKB.dataSource) {
        case 'upload':
          return [
            { type: 'PDF', count: 5 },
            { type: 'DOCX', count: 3 }
          ];
        case 'custom':
          return [{ type: 'TXT', count: 1 }];
        case 'website':
          return [
            { type: 'HTML', count: 10 },
            { type: 'MD', count: 5 }
          ];
        case 'api':
          return [
            { type: 'JSON', count: 8 },
            { type: 'XML', count: 2 }
          ];
        default:
          return [];
      }
    };

    const entry: KnowledgeBase = {
      id: Math.random().toString(36).substring(2, 9),
      name: newKB.name,
      description: newKB.description || '暂无描述',
      type: newKB.type,
      category: newKB.category, // 新增：知识库类型
      permissionType: '私有知识库', // 默认为私有
      embeddingModel: 'text-embedding-3-small', // 默认模型
      vectorStorage: '默认存储', // 默认存储
      status: 'Processing',
      docsCount: newKB.uploadedFiles.length || Math.floor(Math.random() * 20) + 5,
      lastModified: new Date().toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      }).replace(/\//g, '-'),
      creator: '海洋饼干',
      modifier: '海洋饼干',
      tags: newKB.tags,
      isFavorited: false,
      documentTypes: generateDocTypes(),
      documents: [] // 新建知识库初始为空文档列表
    };

    setKnowledgeBases([entry, ...knowledgeBases]);
    setShowPreview(false);
    
    // 显示创建成功提示
    showToast('success', '知识库创建成功');
    
    // 重置所有状态
    setNewKB({ 
      name: '', 
      description: '', 
      type: 'PDF',
      category: '通用知识库',
      dataSource: 'upload',
      tags: [],
      newTag: '',
      uploadedFiles: [],
      iconColor: '#3b82f6'
    });
    
    // 重置第二步状态
    setParseStrategy({
      textExtraction: true,
      layoutAnalysis: true,
      ocr: true
    });
    setSliceMethod('smart');
    setSliceConfig({
      smartMaxLength: 1000,
      maxLength: 1000,
      lengthOverlap: 100,
      titleMaxLength: 1000,
      titleLevel: 1,
      regexPattern: '',
      regexMaxLength: 1000,
      regexFlags: 'g',
      pagesPerChunk: 1,
      mergeShortPages: true,
      separator: '。',
      keepSeparator: false
    });
    setCleaningOptions({
      removeExtraSpaces: true,
      removeSpecialChars: true,
      removeUrls: true,
      removeEmptyLines: false
    });
    
    // 重置第三步状态
    setSearchMode('hybrid');
    setVectorModel('v4');
    setRankModel('qwen3');
    setVectorStorage('default');
    setRetrievalConfig({
      vectorTopK: 10,
      keywordTopK: 10,
      similarityThreshold: 0.01,
      maxRecall: 6
    });
  };

  // 添加标签
  const handleAddTag = () => {
    if (newKB.newTag.trim() && newKB.tags.length < 10) {
      setNewKB({
        ...newKB,
        tags: [...newKB.tags, newKB.newTag.trim()],
        newTag: ''
      });
    }
  };

  // 删除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setNewKB({
      ...newKB,
      tags: newKB.tags.filter(tag => tag !== tagToRemove)
    });
  };

  // 切换收藏状态
  const toggleFavorite = (id: string) => {
    const kb = knowledgeBases.find(k => k.id === id);
    const isFavorited = kb?.isFavorited;
    
    setKnowledgeBases(prev => 
      prev.map(kb => 
        kb.id === id ? { ...kb, isFavorited: !kb.isFavorited } : kb
      )
    );

    setSelectedKB(prev =>
      prev?.id === id ? { ...prev, isFavorited: !prev.isFavorited } : prev
    );
    
    showToast('success', isFavorited ? '已取消关注' : '已关注');
  };

  // 删除知识库
  const deleteKnowledgeBase = (id: string) => {
    setKnowledgeBases(prev => prev.filter(kb => kb.id !== id));
    setSelectedKB(prev => prev?.id === id ? null : prev);
    setDropdownOpenId(null);
    setDeleteConfirmId(null);
    setDeleteConfirmInput('');
    showToast('success', '知识库已成功删除');
  };

  // 确认删除
  const confirmDelete = (id: string) => {
    setDeleteConfirmId(id);
    setDeleteConfirmInput('');
    setDropdownOpenId(null);
  };

  // 复制知识库
  const duplicateKnowledgeBase = (kb: KnowledgeBase) => {
    const newKB: KnowledgeBase = {
      ...kb,
      id: Math.random().toString(36).substring(2, 9),
      name: `${kb.name} (副本)`,
      lastModified: new Date().toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      }).replace(/\//g, '-'),
      modifier: '海洋饼干'
    };
    setKnowledgeBases([newKB, ...knowledgeBases]);
    setDropdownOpenId(null);
    showToast('success', '知识库复制成功');
  };

  // 编辑知识库
  const handleEditKB = (kb: KnowledgeBase) => {
    setEditingNewKBId(kb.id);
    setNewKBStep(1);
    setNewKBConfig({
      icon: '📚',
      iconUrl: '',
      name: kb.name,
      description: kb.description,
      category: kb.category || '通用知识库',
      tags: [...kb.tags],
      kbType: kb.category || '通用知识库',
      retrievalMethod: '混合检索',
      vectorModel: kb.embeddingModel || 'text-embedding-3-large',
      rerankModel: 'bge-reranker-v2-m3',
      topK: 5,
      similarityThreshold: 0.7,
      maxRecall: 10,
      defaultChunkStrategy: 'smart',
      defaultChunkSize: 800,
      defaultOverlap: 100,
      permissionType:
        kb.permissionType === '私有知识库'
          ? 'private'
          : kb.permissionType === '部分公开'
            ? 'partial'
            : 'public',
      allowedTeams: [],
      allowedUsers: [],
      vectorStorage: kb.vectorStorage || 'default'
    });
    setShowNewKBPage(true);
    setDropdownOpenId(null);
  };

  const renderKnowledgeBaseMenu = (kb: KnowledgeBase) => (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setDropdownOpenId(dropdownOpenId === kb.id ? null : kb.id);
        }}
        className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-all"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {dropdownOpenId === kb.id && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-lg shadow-lg shadow-slate-200/50 z-50 overflow-hidden py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleEditKB(kb)}
              className="w-full text-left px-3.5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
            >
              <Edit className="w-3.5 h-3.5" />
              编辑知识库
            </button>
            <button
              onClick={() => {
                setEditingKBForTags(kb);
                setShowKBTagConfigModal(true);
                setDropdownOpenId(null);
              }}
              className="w-full text-left px-3.5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
            >
              <Tag className="w-3.5 h-3.5" />
              配置标签
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              onClick={() => confirmDelete(kb.id)}
              className="w-full text-left px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除知识库
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // 保存编辑
  const saveEditKB = () => {
    if (!editingKB) return;
    
    setKnowledgeBases(prev => 
      prev.map(kb => 
        kb.id === editingKB.id 
          ? { ...kb, name: editingKB.name, description: editingKB.description, tags: editingKB.tags, modifier: '海洋饼干' }
          : kb
      )
    );
    setIsEditModalOpen(false);
    setEditingKB(null);
    setEditingKBTagInput('');
    showToast('success', '知识库修改已保存');
  };

  // 筛选和搜索逻辑
  const filteredKnowledgeBases = knowledgeBases
    .filter(kb => {
      // 基础搜索
      const matchesSearch = kb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kb.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kb.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // 类型筛选
      const matchesType = filterType === 'all' || 
        (filterType === 'favorites' ? kb.isFavorited : 
         fileFormats.includes(filterType) ? kb.documentTypes.some(doc => doc.type === filterType) :
         kb.type === filterType);
      
      // 标签筛选
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.some(tag => kb.tags.includes(tag));
      
      // 权限筛选
      const matchesPermission = permissionFilter === 'all' ||
        (permissionFilter === 'private' ? kb.permissionType === '私有知识库' :
         permissionFilter === 'public' ? kb.permissionType === '公开知识库' : true);
      
      return matchesSearch && matchesType && matchesTags && matchesPermission;
    })
    .sort((a, b) => {
      // 根据选择的排序方式排序
      if (sortBy === 'lastModified') {
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      } else if (sortBy === 'createdTime') {
        // 假设创建时间就是最早的修改时间，这里用lastModified反向排序
        return new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
      } else if (sortBy === 'docsCount') {
        return b.docsCount - a.docsCount;
      }
      return 0;
    });

  // 分页逻辑
  const totalPages = Math.ceil(filteredKnowledgeBases.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentKnowledgeBases = filteredKnowledgeBases.slice(startIndex, endIndex);

  // 当筛选条件改变时重置到第一页
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  // 跳转到指定页
  const handlePageJump = () => {
    const page = parseInt(pageJumpInput);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setPageJumpInput('');
    }
  };

  const createKnowledgeBaseFromForm = async () => {
    setIsCreatingKB(true);
    setCreateKBStatus('creating');

    try {
      await new Promise(resolve => setTimeout(resolve, 600));
      const modifiedTime = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/\//g, '-');

      if (editingNewKBId) {
        let updatedKB: KnowledgeBase | null = null;
        setKnowledgeBases(prev => prev.map(kb => {
          if (kb.id !== editingNewKBId) return kb;
          updatedKB = {
            ...kb,
            name: newKBConfig.name,
            description: newKBConfig.description,
            category: newKBConfig.kbType,
            permissionType: newKBConfig.permissionType === 'public'
              ? '公开知识库'
              : newKBConfig.permissionType === 'partial'
                ? '部分公开'
                : '私有知识库',
            embeddingModel: newKBConfig.vectorModel,
            vectorStorage: newKBConfig.vectorStorage,
            lastModified: modifiedTime,
            modifier: '海洋饼干',
            tags: newKBConfig.tags,
          };
          return updatedKB;
        }));
        if (updatedKB) {
          setSelectedKB(updatedKB);
        }
        setShowNewKBPage(false);
        setEditingNewKBId(null);
        setIsCreatingKB(false);
        setCreateKBStatus('idle');
        setNewKBConfig({ ...newKBConfig, iconUrl: '', name: '', description: '', permissionType: 'public', tags: [] });
        showToast('success', '知识库已保存');
        return;
      }

      const newKB: KnowledgeBase = {
        id: `kb-${Date.now()}`,
        name: newKBConfig.name,
        description: newKBConfig.description,
        type: 'PDF',
        category: newKBConfig.kbType,
        permissionType: newKBConfig.permissionType === 'public'
          ? '公开知识库'
          : newKBConfig.permissionType === 'partial'
            ? '部分公开'
            : '私有知识库',
        embeddingModel: newKBConfig.vectorModel,
        vectorStorage: newKBConfig.vectorStorage,
        status: 'Ready',
        docsCount: 0,
        lastModified: modifiedTime,
        creator: '海洋饼干',
        modifier: '海洋饼干',
        tags: newKBConfig.tags,
        isFavorited: false,
        documentTypes: [],
        documents: []
      };

      setKnowledgeBases(prev => [newKB, ...prev]);
      setSelectedKB(newKB);
      setSelectedDocument(null);
      setShowFileUploadPage(false);
      setShowNewKBPage(false);
      setEditingNewKBId(null);
      setIsCreatingKB(false);
      setCreateKBStatus('idle');
      setTeamPermissions([]);
      setSelectedMembers([]);
      setCollaboratorSearchQuery('');
      setNewKBConfig({ ...newKBConfig, iconUrl: '', name: '', description: '', permissionType: 'public', tags: [] });
      showToast('success', '知识库创建成功');
    } catch (error) {
      setCreateKBStatus('error');
      setIsCreatingKB(false);
      showToast('error', '知识库创建失败，请重试');
    }
  };

  const getFileProcessingStatus = (progress: number) => {
    if (progress >= 100) return '处理完成';
    if (progress >= 82) return '嵌入等待中...';
    if (progress >= 58) return '索引写入中...';
    if (progress >= 32) return '文本分段中...';
    return '文件解析中...';
  };

  const getStageSummary = () => {
    if (importStatus === 'success') return '全部文件处理完成';
    const successFiles = uploadingFiles.filter(file => file.status === 'success');
    const values = successFiles.map(file => processingFileProgress[file.id] || 0);
    const average = values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    return getFileProcessingStatus(average);
  };

  const goToUploadedDocuments = () => {
    setImportStatus('idle');
    setImportProgress({ current: 0, total: 6, stage: '', message: '' });
    setProcessingFileProgress({});
    setShowFileUploadPage(false);
    setUploadingFiles([]);
    setWebUploadUrl('');
    setWebAddedUrls([]);
    setFileUploadTags([]);
    setAutoGeneratedFileTags([]);
    setFileUploadTagGenerationCount(0);
    setFileUploadTagInput('');
    setFileUploadStep(1);
    setDocSearchQuery('');
    setDocCurrentPage(1);
  };

  const startFileImport = () => {
    const successFiles = uploadingFiles.filter(file => file.status === 'success');
    const pendingAudioFiles = uploadingFiles.filter(file => file.sourceType === 'audio' && file.asrStatus === 'processing');
    if (pendingAudioFiles.length > 0) {
      showToast('info', `${pendingAudioFiles[0].name} 正在进行 ASR 转写，请完成后再入库`);
      return;
    }
    const invalidAudioFiles = successFiles.filter(file => {
      if (file.sourceType !== 'audio') return false;
      return !isAudioUploadReady(file);
    });
    if (invalidAudioFiles.length > 0) {
      showToast('warning', `${invalidAudioFiles[0].name} 暂未生成真实 ASR 转写内容：${invalidAudioFiles[0].asrMessage || '请配置后端 ASR 服务或重新上传更清晰的音视频'}`);
      return;
    }
    const invalidFiles = successFiles.filter(file => {
      if (file.sourceType === 'text' || file.sourceType === 'table') {
        return !file.content?.trim();
      }
      return false;
    });
    if (invalidFiles.length > 0) {
      showToast('warning', `${invalidFiles[0].name} 没有可入库的真实内容，请重新上传或更换文件格式`);
      return;
    }
    setFileUploadStep(3);
    setImportStatus('importing');
    setImportProgress({
      current: 1,
      total: 4,
      stage: 'chunking',
      message: '文件解析中...'
    });
    setProcessingFileProgress(Object.fromEntries(successFiles.map((file, index) => [file.id, Math.min(18, 8 + index * 3)])));

    if (successFiles.length === 0) {
      setImportStatus('success');
      return;
    }

    let completed = false;
    const timer = window.setInterval(() => {
      setProcessingFileProgress(prev => {
        const next = successFiles.reduce<Record<string, number>>((acc, file, index) => {
          const current = prev[file.id] ?? Math.min(18, 8 + index * 3);
          const step = current < 34 ? 14 : current < 64 ? 11 : current < 86 ? 8 : 6;
          acc[file.id] = Math.min(100, current + step);
          return acc;
        }, {});
        const values: number[] = Object.values(next);
        const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

        setImportProgress({
          current: average < 34 ? 1 : average < 64 ? 2 : average < 86 ? 3 : 4,
          total: 4,
          stage: average < 34 ? 'cleaning' : average < 64 ? 'chunking' : average < 86 ? 'vectorizing' : 'writing',
          message: getFileProcessingStatus(average)
        });

        if (!completed && values.every(value => value >= 100)) {
          completed = true;
          window.clearInterval(timer);
          window.setTimeout(() => {
            if (selectedKB) {
              const newDocs: Document[] = successFiles.map((file) => {
                const previewEntries = createStep2PreviewEntries(file);
                const parsedText = previewEntries.map(entry => entry.content).join('\n\n');
                const sourceType = file.sourceType || fileUploadFileType;
                const sourceText = file.content || parsedText;
                const imageAnalysis = sourceType === 'image'
                  ? getImageAnalysisResult({
                      name: file.name,
                      previewUrl: file.previewUrl,
                      ocrText: file.ocrText || file.content,
                      ocrStatus: file.ocrStatus,
                      imageVisionLabels: file.imageVisionLabels,
                      imageVisionCaption: file.imageVisionCaption,
                      imageVisionStatus: file.imageVisionStatus
                    })
                  : null;
                const imageAnalysisChunks = imageAnalysis?.chunks || [];
                const audioTranscriptSegments = sourceType === 'audio'
                  ? getAudioTranscriptSegments({
                      name: file.name,
                      content: file.content,
                      asrText: file.asrText,
                      asrSegments: file.asrSegments
                    })
                  : [];
                const audioTranscriptText = audioTranscriptSegments.map(segment => `${segment.time}\n${segment.text}`).join('\n\n');
                return {
                  id: file.id,
                  name: file.name,
                  tags: fileUploadTags,
                  charCount: sourceType === 'audio' ? audioTranscriptText.length : sourceText.length,
                  chunkCount: sourceType === 'audio' ? audioTranscriptSegments.length : previewEntries.length,
                  format: file.name.split('.').pop()?.toUpperCase() || 'FILE',
                  status: 'Ready' as const,
                  lastEdited: new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-'),
                  addedBy: '海洋饼干',
                  enabled: true,
                  sourceType,
                  previewUrl: file.previewUrl,
                  ocrStatus: file.ocrStatus,
                  ocrText: file.ocrText || (sourceType === 'image' ? file.content : undefined),
                  ocrConfidence: file.ocrConfidence,
                  ocrMessage: file.ocrMessage,
                  imageVisionStatus: file.imageVisionStatus,
                  imageVisionLabels: file.imageVisionLabels,
                  imageVisionCaption: file.imageVisionCaption,
                  imageVisionMessage: file.imageVisionMessage,
                  imageVisionProvider: file.imageVisionProvider,
                  asrStatus: file.asrStatus,
                  asrText: file.asrText || (sourceType === 'audio' ? audioTranscriptText : undefined),
                  asrSegments: audioTranscriptSegments,
                  asrMessage: file.asrMessage,
                  asrProvider: file.asrProvider,
                  content: sourceType === 'image'
                    ? imageAnalysisChunks.map(formatImageChunkContent).join('\n\n')
                    : sourceType === 'audio'
                      ? audioTranscriptText
                      : sourceText,
                  chunks: sourceType === 'image'
                    ? imageAnalysisChunks
                    : sourceType === 'audio'
                      ? audioTranscriptSegments.map((segment, index) => ({ id: `asr-${index + 1}`, content: segment.text, type: 'asr_segment', metadata: { timestamp: segment.time } }))
                      : previewEntries,
                  sliceRule: sourceType === 'image'
                    ? (imageAnalysis?.imageType === 'structured' ? '结构化图片切片：OCR 识别 / 语义结构切片' : '非结构化图片切片：整图描述 / 主要对象 / 可见文字')
                    : sourceType === 'audio'
                      ? '音频解析（ASR）：时间戳转写 / 原文对齐 / 播放定位'
                      : getStep2SliceRuleText(),
                  summary: file.parseNote || (sourceType === 'image' ? (file.ocrText ? '已完成图片 OCR 识别并生成语义切片' : '图片已入库，暂未识别到清晰文字') : sourceType === 'audio' ? (audioTranscriptSegments.length > 0 ? '已完成音视频转写并生成时间戳文本' : '音视频已入库，暂未生成转写文本') : '已按上传规则完成解析与切片')
                };
              });
              setKnowledgeBases(prev => prev.map(kb => kb.id === selectedKB.id ? { ...kb, documents: [...newDocs, ...(kb.documents || [])], docsCount: (kb.docsCount || 0) + newDocs.length } : kb));
              setSelectedKB({ ...selectedKB, documents: [...newDocs, ...(selectedKB.documents || [])], docsCount: (selectedKB.docsCount || 0) + newDocs.length });
            }
            setImportStatus('success');
            setImportProgress({
              current: 4,
              total: 4,
              stage: 'writing',
              message: '全部文件处理完成'
            });
            showToast('success', `成功导入 ${successFiles.length} 个文件`);
          }, 400);
        }

        return next;
      });
    }, 650);
  };

  const updateSelectedDocsEnabled = (enabled: boolean) => {
    if (!selectedKB || selectedDocs.length === 0) return;

    const selectedReadyDocs = selectedKB.documents.filter(doc => selectedDocs.includes(doc.id) && doc.status === 'Ready');
    if (selectedReadyDocs.length === 0) {
      showToast('warning', '所选文档中暂无可切换启用状态的文档');
      return;
    }

    setKnowledgeBases(prev => prev.map(kb =>
      kb.id === selectedKB.id
        ? {
            ...kb,
            documents: kb.documents.map(doc =>
              selectedDocs.includes(doc.id) && doc.status === 'Ready'
                ? { ...doc, enabled }
                : doc
            )
          }
        : kb
    ));

    setSelectedKB({
      ...selectedKB,
      documents: selectedKB.documents.map(doc =>
        selectedDocs.includes(doc.id) && doc.status === 'Ready'
          ? { ...doc, enabled }
          : doc
      )
    });

    showToast('success', `已${enabled ? '启用' : '禁用'} ${selectedReadyDocs.length} 个文档`);
  };

  const filteredPermissionUsers = permissionUsers.filter((user) => {
    const query = permissionSearchQuery.trim().toLowerCase();
    const matchesQuery = !query || [user.name, user.id, user.account, user.phone, user.email, user.department, user.status, user.role].some((value) =>
      value.toLowerCase().includes(query)
    );
    const matchesDepartment =
      permissionDepartmentFilter === 'all' ||
      (permissionDepartmentFilter === UNCONFIGURED_DEPARTMENT
        ? isUnconfiguredDepartment(user.department)
        : user.department === permissionDepartmentFilter);
    const matchesRole = permissionRoleFilter === 'all' || user.role === permissionRoleFilter;
    const matchesStatus = permissionStatusFilter === 'all' || user.status === permissionStatusFilter;
    return matchesQuery && matchesDepartment && matchesRole && matchesStatus;
  });

  const filteredPermissionRoles = permissionRoles.filter((role) => {
    const query = permissionSearchQuery.trim().toLowerCase();
    if (!query) return true;
    return [role.name, role.description, role.id].some((value) =>
      value.toLowerCase().includes(query)
    );
  });

  const filterDepartmentTree = (departments: PermissionDepartment[]): PermissionDepartment[] => {
    const query = permissionSearchQuery.trim().toLowerCase();
    if (!query) return departments;

    return departments
      .map((department): PermissionDepartment | null => {
        const filteredChildren = department.children ? filterDepartmentTree(department.children) : [];
        const matches = [department.name, department.owner, department.id].some((value) =>
          value.toLowerCase().includes(query)
        );
        const nextDepartment: PermissionDepartment = { ...department, children: filteredChildren };
        return matches || filteredChildren.length > 0
          ? nextDepartment
          : null;
      })
      .filter((department): department is PermissionDepartment => Boolean(department));
  };

  const filteredPermissionDepartments = filterDepartmentTree(permissionDepartments);
  const allPermissionDepartments = (departments: PermissionDepartment[]): PermissionDepartment[] =>
    departments.flatMap((department) => [department, ...(department.children ? allPermissionDepartments(department.children) : [])]);
  const allDepartmentOptions = allPermissionDepartments(permissionDepartments);
  const selectedDepartment = allDepartmentOptions.find((department) => department.id === selectedDepartmentId) || permissionDepartments[0];
  const selectedDepartmentMembers = permissionUsers.filter((user) =>
    selectedDepartment.memberIds.includes(user.id) || user.department === selectedDepartment.name
  );
  const getDepartmentAccountPrefix = (departmentName: string) => {
    if (departmentName.includes('技术')) return 'tech';
    if (departmentName.includes('产品')) return 'product';
    if (departmentName.includes('HR')) return 'hr';
    if (departmentName.includes('市场')) return 'marketing';
    return departmentName.replace(/部门/g, '').toLowerCase() || 'dept';
  };
  const selectedDepartmentDisplayMembers = [
    ...selectedDepartmentMembers,
    ...Array.from({ length: Math.max(0, selectedDepartment.memberCount - selectedDepartmentMembers.length) }, (_, index) => {
      const serial = index + selectedDepartmentMembers.length + 1;
      const accountPrefix = getDepartmentAccountPrefix(selectedDepartment.name);
      return {
        id: `${selectedDepartment.id}-M-${String(serial).padStart(3, '0')}`,
        name: `${selectedDepartment.name.replace('部门', '')}成员${serial}`,
        account: `${accountPrefix}.member${String(serial).padStart(2, '0')}`,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedDepartment.id}-${serial}`,
        phone: '-',
        email: `${selectedDepartment.id.toLowerCase()}-${serial}@example.com`,
        department: selectedDepartment.name,
        role: '普通成员',
        status: '在职' as const,
        lastLogin: '-',
        isPlaceholderDepartmentMember: true
      };
    })
  ];
  const permissionPaginationSource =
    permissionSection === 'users'
      ? filteredPermissionUsers
      : permissionSection === 'roles'
        ? filteredPermissionRoles
        : selectedDepartmentDisplayMembers;
  const permissionTotalPages = Math.max(1, Math.ceil(permissionPaginationSource.length / permissionItemsPerPage));
  const permissionStartIndex = (permissionPage - 1) * permissionItemsPerPage;
  const permissionEndIndex = permissionStartIndex + permissionItemsPerPage;
  const paginatedPermissionUsers = filteredPermissionUsers.slice(permissionStartIndex, permissionEndIndex);
  const paginatedPermissionRoles = filteredPermissionRoles.slice(permissionStartIndex, permissionEndIndex);
  const paginatedDepartmentMembers = selectedDepartmentDisplayMembers.slice(permissionStartIndex, permissionEndIndex);
  const selectedPermissionUsers = permissionUsers.filter((user) => selectedPermissionUserIds.includes(user.id));
  const currentPermissionTitle =
    permissionSection === 'users' ? '用户管理' : permissionSection === 'roles' ? '角色管理' : '部门管理';
  const currentPermissionDesc =
    permissionSection === 'users'
      ? '统一对用户信息进行管理'
      : permissionSection === 'roles'
        ? '定义系统角色及其权限范围，控制不同岗位的操作边界。'
        : '维护企业组织树、部门负责人和成员规模。';

  useEffect(() => {
    setPermissionPage(1);
    setOpenPermissionMenu(null);
  }, [permissionSection, permissionSearchQuery, permissionDepartmentFilter, permissionRoleFilter, permissionStatusFilter, selectedDepartmentId]);

  const toggleDepartmentExpanded = (departmentId: string) => {
    setExpandedDepartmentIds((prev) =>
      prev.includes(departmentId)
        ? prev.filter((id) => id !== departmentId)
        : [...prev, departmentId]
    );
  };

  const updateDepartmentTree = (
    departments: PermissionDepartment[],
    departmentId: string,
    updater: (department: PermissionDepartment) => PermissionDepartment
  ): PermissionDepartment[] =>
    departments.map((department) => {
      const children = department.children
        ? updateDepartmentTree(department.children, departmentId, updater)
        : undefined;

      if (department.id === departmentId) {
        return updater({ ...department, ...(children ? { children } : {}) });
      }

      return { ...department, ...(children ? { children } : {}) };
    });

  const removeDepartmentFromTree = (
    departments: PermissionDepartment[],
    departmentId: string
  ): PermissionDepartment[] =>
    departments
      .filter((department) => department.id !== departmentId)
      .map((department) => ({
        ...department,
        children: department.children ? removeDepartmentFromTree(department.children, departmentId) : undefined
      }));

  const addDepartmentToTree = (
    departments: PermissionDepartment[],
    parentId: string,
    nextDepartment: PermissionDepartment
  ): PermissionDepartment[] =>
    departments.map((department) => {
      if (department.id === parentId) {
        return {
          ...department,
          children: [...(department.children || []), nextDepartment]
        };
      }

      return {
        ...department,
        children: department.children ? addDepartmentToTree(department.children, parentId, nextDepartment) : undefined
      };
    });

  const handlePermissionActionSubmit = (formData: FormData) => {
    if (permissionAction.type === 'createUser') {
      const name = String(formData.get('name') || '').trim();
      const account = String(formData.get('account') || '').trim();
      const phone = String(formData.get('phone') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '').trim();
      const department = String(formData.get('department') || UNCONFIGURED_DEPARTMENT);
      const role = String(formData.get('role') || '普通成员');
      const status = String(formData.get('status') || '在职') as PermissionUser['status'];
      if (!name || !account || !phone || !email || !password || !role || !status) {
        showToast('error', '请填写必填信息');
        return;
      }
      if (!isValidSixDigitPassword(password)) {
        showToast('error', PASSWORD_RULE_TEXT);
        return;
      }
      const nextId = `U-${1000 + permissionUsers.length + 1}`;
      const nextUser: PermissionUser = {
        id: nextId,
        name,
        account,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${nextId}`,
        phone,
        email,
        department,
        role,
        status,
        lastLogin: '尚未登录'
      };
      setPermissionUsers(prev => [nextUser, ...prev]);
      upsertAuthUser({
        id: nextUser.id,
        name: nextUser.name,
        account: nextUser.account,
        phone: nextUser.phone,
        email: nextUser.email,
        avatar: nextUser.avatar,
        status: nextUser.status
      });
      setUserPassword(nextUser.id, password);
      showToast('success', `已添加用户 ${nextUser.name}`);
    }

    if (permissionAction.type === 'editUser' && permissionAction.user) {
      const password = String(formData.get('password') || '').trim();
      if (!password) {
        showToast('error', '请填写密码');
        return;
      }
      if (!isValidSixDigitPassword(password)) {
        showToast('error', PASSWORD_RULE_TEXT);
        return;
      }
      const nextUser: PermissionUser = {
        ...permissionAction.user,
        phone: String(formData.get('phone') || permissionAction.user.phone),
        email: String(formData.get('email') || permissionAction.user.email),
        department: String(formData.get('department') || permissionAction.user.department),
        role: String(formData.get('role') || permissionAction.user.role),
        status: String(formData.get('status') || permissionAction.user.status) as PermissionUser['status']
      };
      setPermissionUsers(prev => prev.map(user => user.id === nextUser.id ? nextUser : user));
      upsertAuthUser({
        id: nextUser.id,
        name: nextUser.name,
        account: nextUser.account,
        phone: nextUser.phone,
        email: nextUser.email,
        avatar: nextUser.avatar,
        status: nextUser.status
      });
      setUserPassword(nextUser.id, password);
      showToast('success', `${nextUser.name} 信息已更新`);
    }

    if (permissionAction.type === 'deleteUser' && permissionAction.user) {
      const confirmAccount = String(formData.get('confirmUserAccount') || '').trim();
      if (confirmAccount !== permissionAction.user.account) {
        showToast('error', '账号不匹配，未删除');
        return;
      }
      setPermissionUsers(prev => prev.filter(user => user.id !== permissionAction.user!.id));
      setPermissionDepartments(prev => prev.map(department => ({
        ...department,
        memberIds: department.memberIds.filter(memberId => memberId !== permissionAction.user!.id)
      })));
      removeAuthUser(permissionAction.user.id);
      showToast('success', `${permissionAction.user.name} 已删除`);
    }

    if (permissionAction.type === 'assignRole' && permissionAction.user) {
      const role = String(formData.get('role') || permissionAction.user.role);
      setPermissionUsers(prev => prev.map(user =>
        user.id === permissionAction.user!.id ? { ...user, role } : user
      ));
      showToast('success', `${permissionAction.user.name} 的角色已更新`);
    }

    if (permissionAction.type === 'toggleStatus' && permissionAction.user) {
      const nextStatus: PermissionUser['status'] = permissionAction.user.status === '在职' ? '已禁用' : '在职';
      setPermissionUsers(prev => prev.map(user =>
        user.id === permissionAction.user!.id ? { ...user, status: nextStatus } : user
      ));
      upsertAuthUser({
        id: permissionAction.user.id,
        name: permissionAction.user.name,
        account: permissionAction.user.account,
        phone: permissionAction.user.phone,
        email: permissionAction.user.email,
        avatar: permissionAction.user.avatar,
        status: nextStatus
      });
      showToast('success', `${permissionAction.user.name} 已${nextStatus === '在职' ? '启用' : '禁用'}`);
    }

    if (permissionAction.type === 'resetPassword' && permissionAction.user) {
      setPermissionUsers(prev => prev.map(user =>
        user.id === permissionAction.user!.id
          ? { ...user, lastLogin: '等待用户使用临时密码登录' }
          : user
      ));
      setUserPassword(permissionAction.user.id, DEFAULT_AUTH_PASSWORD);
      showToast('success', `${permissionAction.user.name} 的临时密码已生成`);
    }

    if (permissionAction.type === 'createRole') {
      const roleName = String(formData.get('roleName') || '').trim();
      if (!roleName) {
        showToast('error', '请填写角色名称');
        return;
      }
      const nextRole: PermissionRole = {
        id: `R-${Date.now().toString().slice(-4)}`,
        name: roleName,
        type: '自定义',
        description: String(formData.get('roleDescription') || '自定义角色。'),
        userCount: 0,
        createdAt: new Date().toLocaleDateString('zh-CN').replace(/\//g, '-'),
        permissions: {
          知识库管理: formData.getAll('knowledgePermissions').map(String)
        }
      };
      setPermissionRoles(prev => [nextRole, ...prev]);
      showToast('success', `已新建角色 ${nextRole.name}`);
    }

    if (permissionAction.type === 'editRole' && permissionAction.role) {
      const nextRole: PermissionRole = {
        ...permissionAction.role,
        name: String(formData.get('roleName') || permissionAction.role.name),
        description: String(formData.get('roleDescription') || permissionAction.role.description),
        permissions: {
          知识库管理: formData.getAll('knowledgePermissions').map(String)
        }
      };
      setPermissionRoles(prev => prev.map(role => role.id === nextRole.id ? nextRole : role));
      showToast('success', `${nextRole.name} 已更新`);
    }

    if (permissionAction.type === 'deleteRole' && permissionAction.role) {
      const confirmName = String(formData.get('confirmRoleName') || '');
      if (confirmName !== permissionAction.role.name) {
        showToast('error', '角色名称不匹配，未删除');
        return;
      }
      setPermissionRoles(prev => prev.filter(role => role.id !== permissionAction.role!.id));
      setPermissionUsers(prev => prev.map(user => ({
        ...user,
        role: user.role === permissionAction.role!.name ? '普通成员' : user.role
      })));
      showToast('success', `${permissionAction.role.name} 已删除`);
    }

    if (permissionAction.type === 'createDepartment') {
      const departmentName = String(formData.get('departmentName') || '').trim();
      if (!departmentName) {
        showToast('error', '请填写部门名称');
        return;
      }
      const nextDepartment: PermissionDepartment = {
        id: `D-${Date.now().toString().slice(-4)}`,
        name: departmentName,
        owner: String(formData.get('departmentOwner') || '未设置'),
        memberCount: 0,
        memberIds: []
      };
      const parentId = String(formData.get('parentDepartmentId') || 'root');
      setPermissionDepartments(prev =>
        parentId === 'root'
          ? [...prev, nextDepartment]
          : addDepartmentToTree(prev, parentId, nextDepartment)
      );
      if (parentId !== 'root') {
        setExpandedDepartmentIds(prev => prev.includes(parentId) ? prev : [...prev, parentId]);
      }
      setSelectedDepartmentId(nextDepartment.id);
      showToast('success', `已新建部门 ${nextDepartment.name}`);
    }

    if (permissionAction.type === 'editDepartment' && permissionAction.department) {
      const nextName = String(formData.get('departmentName') || permissionAction.department.name);
      const nextOwner = String(formData.get('departmentOwner') || permissionAction.department.owner);
      setPermissionDepartments(prev => updateDepartmentTree(prev, permissionAction.department!.id, (department) => ({
        ...department,
        name: nextName,
        owner: nextOwner
      })));
      setPermissionUsers(prev => prev.map(user =>
        user.department === permissionAction.department!.name ? { ...user, department: nextName } : user
      ));
      showToast('success', `${nextName} 信息已更新`);
    }

    if (permissionAction.type === 'setDepartmentOwner' && permissionAction.department) {
      const ownerId = String(formData.get('ownerId') || '');
      const owner = permissionUsers.find(user => user.id === ownerId);
      if (!owner) {
        showToast('error', '请选择部门负责人');
        return;
      }
      setPermissionDepartments(prev => updateDepartmentTree(prev, permissionAction.department!.id, (department) => ({
        ...department,
        owner: owner.name
      })));
      showToast('success', `负责人已设置为 ${owner.name}`);
    }

    if (permissionAction.type === 'deleteDepartment' && permissionAction.department) {
      const confirmName = String(formData.get('confirmDepartmentName') || '');
      if (confirmName !== permissionAction.department.name) {
        showToast('error', '部门名称不匹配，未删除');
        return;
      }
      setPermissionDepartments(prev => removeDepartmentFromTree(prev, permissionAction.department!.id));
      setPermissionUsers(prev => prev.map(user =>
        user.department === permissionAction.department!.name ? { ...user, department: UNCONFIGURED_DEPARTMENT } : user
      ));
      const nextSelected = allDepartmentOptions.find(department => department.id !== permissionAction.department!.id);
      if (nextSelected) setSelectedDepartmentId(nextSelected.id);
      showToast('success', `${permissionAction.department.name} 已删除`);
    }

    if (permissionAction.type === 'addDepartmentMember' && permissionAction.department) {
      const userId = String(formData.get('memberId') || '');
      const member = permissionUsers.find(user => user.id === userId);
      if (!member) {
        showToast('error', '请选择要添加的成员');
        return;
      }
      setPermissionDepartments(prev => updateDepartmentTree(prev, permissionAction.department!.id, (department) => {
        const memberIds = department.memberIds.includes(userId)
          ? department.memberIds
          : [...department.memberIds, userId];
        return { ...department, memberIds, memberCount: memberIds.length };
      }));
      setPermissionUsers(prev => prev.map(user =>
        user.id === userId ? { ...user, department: permissionAction.department!.name } : user
      ));
      showToast('success', `已添加 ${member.name}`);
    }

    if (permissionAction.type === 'removeDepartmentMember' && permissionAction.department && permissionAction.user) {
      const userId = permissionAction.user.id;
      const member = permissionUsers.find(user => user.id === userId);
      setPermissionDepartments(prev => updateDepartmentTree(prev, permissionAction.department!.id, (department) => {
        const memberIds = department.memberIds.filter(id => id !== userId);
        const nextCount = Math.max(0, department.memberCount - 1);
        return { ...department, memberIds, memberCount: nextCount };
      }));
      if (member) {
        setPermissionUsers(prev => prev.map(user =>
          user.id === userId ? { ...user, department: UNCONFIGURED_DEPARTMENT } : user
        ));
      }
      showToast('success', `${permissionAction.user.name} 已移出部门，并标记为${UNCONFIGURED_DEPARTMENT}`);
    }

    if (permissionAction.type === 'changeDepartmentMember' && permissionAction.department && permissionAction.user) {
      const targetDepartmentId = String(formData.get('targetDepartmentId') || '');
      const targetDepartment = allDepartmentOptions.find(department => department.id === targetDepartmentId);
      if (!targetDepartment) {
        showToast('error', '请选择目标部门');
        return;
      }
      const movingUserId = permissionAction.user.id;
      const movingUser = permissionUsers.find(user => user.id === movingUserId);
      setPermissionDepartments(prev => {
        const removed = updateDepartmentTree(prev, permissionAction.department!.id, (department) => {
          const memberIds = department.memberIds.filter(id => id !== movingUserId);
          return { ...department, memberIds, memberCount: Math.max(0, department.memberCount - 1) };
        });
        return updateDepartmentTree(removed, targetDepartment.id, (department) => {
          const memberIds = !movingUser
            ? department.memberIds
            : department.memberIds.includes(movingUserId)
            ? department.memberIds
            : [...department.memberIds, movingUserId];
          return { ...department, memberIds, memberCount: department.memberCount + 1 };
        });
      });
      if (movingUser) {
        setPermissionUsers(prev => prev.map(user =>
          user.id === movingUserId ? { ...user, department: targetDepartment.name } : user
        ));
      }
      setSelectedDepartmentId(targetDepartment.id);
      showToast('success', `${permissionAction.user.name} 已更换到 ${targetDepartment.name}`);
    }

    setPermissionAction({ type: null });
  };

  const batchUpdatePermissionUsersStatus = (status: PermissionUser['status']) => {
    if (selectedPermissionUserIds.length === 0) {
      showToast('warning', '请先选择需要操作的用户');
      return;
    }
    setPermissionUsers(prev => prev.map(user =>
      selectedPermissionUserIds.includes(user.id) ? { ...user, status } : user
    ));
    showToast('success', `已${status === '在职' ? '启用' : '禁用'} ${selectedPermissionUserIds.length} 个用户`);
    setSelectedPermissionUserIds([]);
    setIsPermissionBatchMode(false);
  };

  const batchDeletePermissionUsers = () => {
    if (selectedPermissionUserIds.length === 0) {
      showToast('warning', '请先选择需要删除的用户');
      return;
    }
    const deletingIds = new Set(selectedPermissionUserIds);
    setPermissionUsers(prev => prev.filter(user => !deletingIds.has(user.id)));
    setPermissionDepartments(prev =>
      prev.map((department) => ({
        ...department,
        memberIds: department.memberIds.filter((memberId) => !deletingIds.has(memberId))
      }))
    );
    showToast('success', `已删除 ${selectedPermissionUserIds.length} 个用户`);
    setSelectedPermissionUserIds([]);
    setIsPermissionBatchMode(false);
  };

  const renderDepartmentRow = (department: PermissionDepartment, level = 0): ReactNode[] => {
    const hasChildren = Boolean(department.children?.length);
    const isExpanded = expandedDepartmentIds.includes(department.id) || permissionSearchQuery.trim().length > 0;
    const rows = [
      <div
        key={department.id}
        className={`grid min-w-[520px] grid-cols-[1fr_88px] items-center gap-3 px-3 py-3 text-sm transition-colors ${
          selectedDepartmentId === department.id ? 'bg-blue-50/80' : 'hover:bg-slate-50'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: level * 22 }}>
          <button
            onClick={() => hasChildren && toggleDepartmentExpanded(department.id)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              hasChildren ? 'text-slate-500 hover:bg-slate-100 hover:text-blue-600' : 'text-transparent'
            }`}
          >
            {hasChildren && (
              isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setSelectedDepartmentId(department.id)}
            className="flex min-w-0 items-center gap-2 text-left"
          >
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{department.name}</div>
          </div>
          </button>
        </div>
        <div className="text-right text-xs font-medium text-slate-500">
          {department.memberCount} 人
        </div>
      </div>
    ];

    if (hasChildren && isExpanded) {
      rows.push(...department.children!.flatMap((child) => renderDepartmentRow(child, level + 1)));
    }

    return rows;
  };

  return (
    <div className="flex h-screen w-full bg-gradient-to-br from-slate-50 via-white to-slate-50/50 text-slate-900 font-sans antialiased">
      {/* Sidebar - 优化为通透简洁风格 */}
      <aside className={`bg-white/80 backdrop-blur-xl border-r border-slate-200/60 flex flex-col h-screen shrink-0 transition-all duration-300 shadow-sm fixed left-0 top-0 z-20 ${
        isSidebarCollapsed ? 'w-20' : 'w-64'
      }`}>
        <div className={`p-5 border-b border-slate-100/80 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Layout className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg tracking-tight text-slate-800">知识库</span>
            </div>
          )}
          {/* 收起/展开按钮 */}
          <button
            onClick={() => {
              setIsUserSettingsMenuOpen(false);
              setIsSidebarCollapsed(!isSidebarCollapsed);
            }}
            className={`p-2 hover:bg-slate-100/80 rounded-lg transition-all text-slate-400 hover:text-slate-600 ${
              isSidebarCollapsed ? 'w-full flex justify-center' : ''
            }`}
            title={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4.5 h-4.5" />
            ) : (
              <ChevronLeft className="w-4.5 h-4.5" />
            )}
          </button>
        </div>

        <div className="px-4 py-5">
          <nav>
            {!isSidebarCollapsed ? (
              <div className="space-y-2">
                <button
                  onClick={() => {
                    switchModule('knowledge');
                    setSelectedKB(null);
                    setSelectedDocument(null);
                    setShowNewKBPage(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
                    activeModule === 'knowledge'
                      ? 'bg-blue-50/80 text-blue-600 font-medium shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {activeModule === 'knowledge' && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute left-0 w-1 h-5 bg-blue-600 rounded-r-full"
                    />
                  )}
                  <BookOpen className={`w-4.5 h-4.5 ${activeModule === 'knowledge' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="text-[13px]">知识库</span>
                </button>
                <div>
                  <button
                    onClick={() => {
                      switchModule('skill');
                      setSelectedKB(null);
                      setSelectedDocument(null);
                      setShowNewKBPage(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
                      activeModule === 'skill'
                        ? 'bg-blue-50/80 text-blue-600 font-medium shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {activeModule === 'skill' && (
                      <motion.div
                        layoutId="active-indicator"
                        className="absolute left-0 w-1 h-5 bg-blue-600 rounded-r-full"
                      />
                    )}
                    <Sparkles className={`w-4.5 h-4.5 ${activeModule === 'skill' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="text-[13px]">Skill中心</span>
                    <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${activeModule === 'skill' ? 'rotate-180 text-blue-500' : 'text-slate-300'}`} />
                  </button>
                  {activeModule === 'skill' && (
                    <div className="mt-1 space-y-1 pl-8">
                      {SKILL_NAV_ITEMS.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => {
                            setSelectedKB(null);
                            setSelectedDocument(null);
                            setShowNewKBPage(false);
                            navigate(item.path);
                          }}
                          className={`w-full rounded-md px-3 py-1.5 text-left text-[12px] leading-5 font-medium transition-colors ${
                            activeSkillPage.key === item.key
                              ? 'bg-blue-50/60 text-blue-600'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => {
                      switchModule('permission');
                      setSelectedKB(null);
                      setSelectedDocument(null);
                      setShowNewKBPage(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
                      activeModule === 'permission'
                        ? 'bg-blue-50/80 text-blue-600 font-medium shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {activeModule === 'permission' && (
                      <motion.div
                        layoutId="active-indicator"
                        className="absolute left-0 w-1 h-5 bg-blue-600 rounded-r-full"
                      />
                    )}
                    <ShieldCheck className={`w-4.5 h-4.5 ${activeModule === 'permission' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="text-[13px]">权限管理</span>
                    <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${activeModule === 'permission' ? 'rotate-180 text-blue-500' : 'text-slate-300'}`} />
                  </button>
                  {activeModule === 'permission' && (
                    <div className="mt-1 space-y-1 pl-8">
                      {[
                        { key: 'users' as const, label: '用户管理' },
                        { key: 'roles' as const, label: '角色管理' },
                        { key: 'departments' as const, label: '部门管理' }
                      ].map((item) => (
                        <button
                          key={item.key}
                          onClick={() => {
                            setPermissionSection(item.key);
                            setPermissionSearchQuery('');
                          }}
                          className={`w-full rounded-md px-3 py-1.5 text-left text-[12px] leading-5 font-medium transition-colors ${
                            permissionSection === item.key
                              ? 'bg-blue-50/60 text-blue-600'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => {
                    switchModule('knowledge');
                    setSelectedKB(null);
                    setSelectedDocument(null);
                    setShowNewKBPage(false);
                  }}
                  className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all relative ${
                    activeModule === 'knowledge' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                  title="知识库"
                >
                  {activeModule === 'knowledge' && <div className="absolute left-0 w-1 h-6 bg-blue-600 rounded-r-full" />}
                  <BookOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    switchModule('skill');
                    setSelectedKB(null);
                    setSelectedDocument(null);
                    setShowNewKBPage(false);
                  }}
                  className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all relative ${
                    activeModule === 'skill' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                  title="Skill中心"
                >
                  {activeModule === 'skill' && <div className="absolute left-0 w-1 h-6 bg-blue-600 rounded-r-full" />}
                  <Sparkles className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    switchModule('permission');
                    setSelectedKB(null);
                    setSelectedDocument(null);
                    setShowNewKBPage(false);
                  }}
                  className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all relative ${
                    activeModule === 'permission' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                  title="权限管理"
                >
                  {activeModule === 'permission' && <div className="absolute left-0 w-1 h-6 bg-blue-600 rounded-r-full" />}
                  <ShieldCheck className="w-4 h-4" />
                </button>
              </div>
            )}
          </nav>
        </div>

        <div className={`mt-auto p-4 border-t border-slate-100/80 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
          {!isSidebarCollapsed ? (
            <>
              <div className="relative group cursor-pointer">
                <img 
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=海洋饼干" 
                  alt="Avatar" 
                  className="w-10 h-10 rounded-xl border-2 border-white shadow-sm ring-1 ring-slate-200/60 group-hover:ring-blue-400/60 transition-all"
                />
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm"></div>
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-semibold text-slate-700 leading-none mb-1 truncate">海洋饼干</span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Premium</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsUserSettingsMenuOpen((open) => !open)}
                  className={`p-2 rounded-lg transition-all ${
                    isUserSettingsMenuOpen
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/80'
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={isUserSettingsMenuOpen}
                  title="设置"
                >
                  <Settings className="w-4.5 h-4.5" />
                </button>
                {isUserSettingsMenuOpen && (
                  <div className="absolute bottom-12 right-0 z-50 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/70">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserSettingsMenuOpen(false);
                        clearAuthSession();
                        navigate('/login', {replace: true});
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-600"
                      role="menuitem"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>退出</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="relative group cursor-pointer">
              <img 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=海洋饼干" 
                alt="Avatar" 
                className="w-11 h-11 rounded-xl border-2 border-white shadow-sm ring-1 ring-slate-200/60 group-hover:ring-blue-400/60 transition-all"
                title="海洋饼干"
              />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm"></div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col h-full min-w-0 ${isSidebarCollapsed ? 'ml-20' : 'ml-64'}`}>
        {/* Header - 优化为通透简洁风格 */}
        <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-8 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-pink-50 to-pink-50/50 rounded-xl border border-pink-100/50">
              {activeModule === 'permission' ? (
                <ShieldCheck className="w-4 h-4 text-pink-500" />
              ) : activeModule === 'skill' ? (
                <Sparkles className="w-4 h-4 text-pink-500" />
              ) : (
                <BookOpen className="w-4 h-4 text-pink-500" />
              )}
            </div>
            <h1 className="text-lg font-semibold text-slate-800 tracking-tight">
              {activeModule === 'permission' ? '权限管理' : activeModule === 'skill' ? 'Skill中心' : '知识库'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {activeModule === 'knowledge' && !selectedKB && !showNewKBPage && (
              <button
                onClick={() => {
                  setEditingNewKBId(null);
                  setShowNewKBPage(true);
                  setNewKBStep(1);
                  setCreateKBStatus('idle');
                  setNewKBConfig({
                    icon: '📚',
                    iconUrl: '',
                    name: '',
                    description: '',
                    category: '通用知识库',
                    tags: [],
                    kbType: '通用知识库',
                    retrievalMethod: '混合检索',
                    vectorModel: 'text-embedding-3-large',
                    rerankModel: 'bge-reranker-v2-m3',
                    topK: 5,
                    similarityThreshold: 0.7,
                    maxRecall: 10,
                    defaultChunkStrategy: 'smart',
                    defaultChunkSize: 800,
                    defaultOverlap: 100,
                    permissionType: 'public',
                    allowedTeams: [],
                    allowedUsers: [],
                    vectorStorage: 'default'
                  });
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>创建知识库</span>
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        {activeModule === 'permission' ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            <div className="flex-1 overflow-y-auto px-8 py-6 no-scrollbar">
              <div className="max-w-[1600px] mx-auto space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{currentPermissionTitle}</h2>
                        <p className="mt-1 text-sm text-slate-500">{currentPermissionDesc}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {permissionSection === 'users' && (
                      <>
                        <button onClick={() => setPermissionAction({ type: 'createUser' })} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700">
                          <Plus className="h-4 w-4" />
                          添加用户
                        </button>
                        <button
                          onClick={() => {
                            setIsPermissionBatchMode(prev => !prev);
                            setSelectedPermissionUserIds([]);
                          }}
                          className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                            isPermissionBatchMode
                              ? 'border-blue-200 bg-blue-50 text-blue-600'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {isPermissionBatchMode ? '取消批量' : '批量操作'}
                        </button>
                      </>
                    )}
                    {permissionSection === 'roles' && (
                      <button onClick={() => setPermissionAction({ type: 'createRole' })} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700">
                        <Plus className="h-4 w-4" />
                        新建角色
                      </button>
                    )}
                    {permissionSection === 'departments' && (
                      <button onClick={() => setPermissionAction({ type: 'createDepartment' })} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700">
                        <Plus className="h-4 w-4" />
                        新建部门
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/70 px-4 py-3 shadow-sm backdrop-blur">
                  <div className={`relative ${permissionSection === 'users' ? 'w-80' : 'w-[420px]'}`}>
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder={permissionSection === 'users' ? '搜索用户信息' : `搜索${currentPermissionTitle}...`}
                      value={permissionSearchQuery}
                      onChange={(e) => setPermissionSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                    />
                  </div>
                  {permissionSection === 'users' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={permissionDepartmentFilter}
                        onChange={(e) => setPermissionDepartmentFilter(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                      >
                        <option value="all">全部部门</option>
                        <option value={UNCONFIGURED_DEPARTMENT}>{UNCONFIGURED_DEPARTMENT}</option>
                        {allDepartmentOptions.map((department) => (
                          <option key={department.id} value={department.name}>{department.name}</option>
                        ))}
                      </select>
                      <select
                        value={permissionRoleFilter}
                        onChange={(e) => setPermissionRoleFilter(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                      >
                        <option value="all">全部角色</option>
                        {permissionRoles.map((role) => (
                          <option key={role.id} value={role.name}>{role.name}</option>
                        ))}
                      </select>
                      <select
                        value={permissionStatusFilter}
                        onChange={(e) => setPermissionStatusFilter(e.target.value as 'all' | PermissionUser['status'])}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                      >
                        <option value="all">全部状态</option>
                        <option value="在职">在职</option>
                        <option value="已禁用">已禁用</option>
                      </select>
                    </div>
                  )}
                </div>

                {permissionSection === 'users' && (
                  <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className={`grid min-w-full ${isPermissionBatchMode ? 'grid-cols-[32px_minmax(130px,1.15fr)_105px_118px_minmax(140px,1fr)_96px_92px_82px_118px_44px]' : 'grid-cols-[minmax(130px,1.2fr)_105px_118px_minmax(140px,1fr)_96px_92px_82px_118px_44px]'} items-center gap-2.5 border-b border-slate-200 bg-slate-50/90 px-4 py-3 text-xs font-semibold text-slate-500`}>
                      {isPermissionBatchMode && (
                        <div>
                          <input
                            type="checkbox"
                            checked={filteredPermissionUsers.length > 0 && filteredPermissionUsers.every(user => selectedPermissionUserIds.includes(user.id))}
                            onChange={(e) => {
                              setSelectedPermissionUserIds(e.target.checked ? filteredPermissionUsers.map(user => user.id) : []);
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </div>
                      )}
                      <div>用户</div>
                      <div>账号</div>
                      <div>手机号</div>
                      <div>邮箱</div>
                      <div>所属部门</div>
                      <div>绑定角色</div>
                      <div>账号状态</div>
                      <div>最后登录时间</div>
                      <div className="text-right">操作</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {paginatedPermissionUsers.map((user) => (
                        <div key={user.id} className={`grid min-w-full ${isPermissionBatchMode ? 'grid-cols-[32px_minmax(130px,1.15fr)_105px_118px_minmax(140px,1fr)_96px_92px_82px_118px_44px]' : 'grid-cols-[minmax(130px,1.2fr)_105px_118px_minmax(140px,1fr)_96px_92px_82px_118px_44px]'} items-center gap-2.5 px-4 py-4 text-sm transition-colors hover:bg-slate-50`}>
                          {isPermissionBatchMode && (
                            <div>
                              <input
                                type="checkbox"
                                checked={selectedPermissionUserIds.includes(user.id)}
                                onChange={(e) => {
                                  setSelectedPermissionUserIds(prev =>
                                    e.target.checked ? [...prev, user.id] : prev.filter(id => id !== user.id)
                                  );
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            </div>
                          )}
                          <div className="flex min-w-0 items-center gap-3">
                            <img src={user.avatar} alt={user.name} className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white" />
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900">{user.name}</div>
                            </div>
                          </div>
                          <div className="font-medium text-slate-700">{user.account}</div>
                          <div className="text-slate-600">{user.phone}</div>
                          <div className="truncate text-slate-600" title={user.email}>{user.email}</div>
                          <div className={isUnconfiguredDepartment(user.department) ? 'font-semibold text-red-500' : 'text-slate-600'}>
                            {getDepartmentDisplayName(user.department)}
                          </div>
                          <div className="min-w-0">
                            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">{user.role}</span>
                          </div>
                          <div>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                              user.status === '在职'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                user.status === '在职' ? 'bg-emerald-500' : 'bg-amber-500'
                              }`} />
                              {user.status}
                            </span>
                          </div>
                          <div className="text-slate-600">{user.lastLogin}</div>
                          <div className="relative flex items-center justify-end">
                            <button
                              onClick={() => setOpenPermissionMenu(openPermissionMenu === `user-${user.id}` ? null : `user-${user.id}`)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openPermissionMenu === `user-${user.id}` && (
                              <div className="absolute right-0 top-9 z-50 w-36 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-200/70">
                                {[
                                  { label: '编辑', icon: Edit, action: () => setPermissionAction({ type: 'editUser', user }) },
                                  { label: '分配角色', icon: ShieldCheck, action: () => setPermissionAction({ type: 'assignRole', user }) },
                                  { label: '重置密码', icon: RotateCcw, action: () => setPermissionAction({ type: 'resetPassword', user }) },
                                  { label: user.status === '在职' ? '禁用' : '启用', icon: Lock, action: () => setPermissionAction({ type: 'toggleStatus', user }) },
                                  { label: '删除', icon: Trash2, action: () => setPermissionAction({ type: 'deleteUser', user }), danger: true }
                                ].map((item) => (
                                  <button
                                    key={item.label}
                                    onClick={() => {
                                      setOpenPermissionMenu(null);
                                      item.action();
                                    }}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'}`}
                                  >
                                    <item.icon className="h-3.5 w-3.5" />
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {permissionSection === 'users' && isPermissionBatchMode && selectedPermissionUserIds.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 18, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="fixed left-1/2 bottom-24 z-50 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl shadow-slate-300/40 backdrop-blur-md"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Check className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-semibold text-slate-800">已选 {selectedPermissionUserIds.length} 条</span>
                        </div>
                        <button
                          onClick={() => batchUpdatePermissionUsersStatus('在职')}
                          className="rounded-xl px-4 py-2 text-sm font-medium text-blue-600 transition-all hover:bg-blue-50"
                        >
                          启用
                        </button>
                        <button
                          onClick={() => batchUpdatePermissionUsersStatus('已禁用')}
                          className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-100"
                        >
                          禁用
                        </button>
                        <button
                          onClick={() => {
                            if (selectedPermissionUserIds.length === 0) {
                              showToast('warning', '请先选择需要删除的用户');
                              return;
                            }
                            setShowPermissionBatchDeleteConfirm(true);
                          }}
                          className="rounded-xl px-4 py-2 text-sm font-medium text-red-600 transition-all hover:bg-red-50"
                        >
                          删除
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPermissionUserIds([]);
                            setIsPermissionBatchMode(false);
                          }}
                          className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 transition-all hover:bg-slate-100"
                        >
                          取消
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {permissionSection === 'roles' && (
                  <div className="space-y-4">
                    <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="grid min-w-[920px] grid-cols-[minmax(180px,1fr)_minmax(340px,1.5fr)_120px_minmax(180px,1fr)_130px_64px] items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 text-xs font-semibold text-slate-500">
                        <div>角色名称</div>
                        <div>角色描述</div>
                        <div className="text-right">关联用户数</div>
                        <div>权限范围</div>
                        <div>创建时间</div>
                        <div className="text-right">操作</div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {paginatedPermissionRoles.map((role) => (
                          <div key={role.id} className="grid min-w-[920px] grid-cols-[minmax(180px,1fr)_minmax(340px,1.5fr)_120px_minmax(180px,1fr)_130px_64px] items-center gap-3 px-4 py-4 text-sm transition-colors hover:bg-slate-50">
                            <div className="flex min-w-0 items-center">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-slate-900">{role.name}</div>
                              </div>
                            </div>
                            <div className="truncate text-slate-600" title={role.description}>{role.description}</div>
                            <div className="text-right">
                              <button
                                onClick={() => setPermissionAction({ type: 'viewRoleUsers', role })}
                                className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:bg-blue-50 hover:text-blue-600"
                              >
                                {permissionUsers.filter(user => user.role === role.name).length || role.userCount} 人
                              </button>
                            </div>
                            <div className="flex min-w-0 flex-wrap gap-1.5">
                              {(['知识库管理'] as const).map((moduleName) => {
                                const permissionList = getRoleKnowledgePermissions(role);
                                return (
                                  <button key={moduleName} onClick={() => setPermissionAction({ type: 'viewRolePermissions', role })} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-all hover:bg-blue-50 hover:text-blue-600">
                                    权限 {permissionList.length} 项
                                  </button>
                                );
                              })}
                            </div>
                            <div className="text-slate-600">{role.createdAt}</div>
                            <div className="relative flex justify-end">
                              <button
                                onClick={() => setOpenPermissionMenu(openPermissionMenu === `role-${role.id}` ? null : `role-${role.id}`)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              {openPermissionMenu === `role-${role.id}` && (
                                <div className="absolute right-0 top-10 z-30 w-32 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-200/70">
                                  <button onClick={() => {
                                    const copiedRole: PermissionRole = {
                                      ...role,
                                      id: `R-${Date.now().toString().slice(-4)}`,
                                      name: `${role.name} 副本`,
                                      type: '自定义',
                                      userCount: 0,
                                      createdAt: new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
                                    };
                                    setOpenPermissionMenu(null);
                                    setPermissionRoles(prev => [copiedRole, ...prev]);
                                    showToast('success', `已复制角色：${role.name}`);
                                  }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-600"><Copy className="h-3.5 w-3.5" />复制</button>
                                  <button onClick={() => { setOpenPermissionMenu(null); setPermissionAction({ type: 'editRole', role }); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-600"><Edit className="h-3.5 w-3.5" />编辑</button>
                                  <button onClick={() => { setOpenPermissionMenu(null); setPermissionAction({ type: 'deleteRole', role }); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />删除</button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {permissionSection === 'departments' && (
                  <div className="grid grid-cols-[minmax(240px,0.62fr)_minmax(0,1.38fr)] gap-4">
                    <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">部门树</div>
                          <div className="mt-0.5 text-xs text-slate-500">父子层级结构，支持展开/折叠</div>
                        </div>
                        <button onClick={() => setPermissionAction({ type: 'createDepartment' })} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100">新建</button>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {filteredPermissionDepartments.flatMap((department) => renderDepartmentRow(department))}
                      </div>
                    </div>

                    <div className="min-w-0 space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">{selectedDepartment.name}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                              <span>部门ID：{selectedDepartment.id}</span>
                              <span>负责人：{selectedDepartment.owner}</span>
                              <span>成员：{selectedDepartmentMembers.length} 人</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setPermissionAction({ type: 'editDepartment', department: selectedDepartment })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">编辑部门</button>
                            <button onClick={() => setPermissionAction({ type: 'deleteDepartment', department: selectedDepartment })} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100">删除</button>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">部门成员</div>
                            <div className="mt-0.5 text-xs text-slate-500">可查看成员账号，并对当前部门成员执行移出或更换部门。</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-[minmax(130px,1.15fr)_minmax(120px,0.95fr)_88px_128px] items-center gap-2 border-b border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-500">
                          <div>成员</div>
                          <div>账号</div>
                          <div>角色</div>
                          <div className="text-center">操作</div>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {selectedDepartmentDisplayMembers.length > 0 ? (
                            paginatedDepartmentMembers.map((user) => (
                              <div key={user.id} className="grid grid-cols-[minmax(130px,1.15fr)_minmax(120px,0.95fr)_88px_128px] items-center gap-2 px-3 py-3 text-sm hover:bg-slate-50">
                                <div className="flex min-w-0 items-center gap-3">
                                  <img src={user.avatar} alt={user.name} className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white" />
                                  <div className="min-w-0">
                                    <div className="truncate font-semibold text-slate-900">{user.name}</div>
                                  </div>
                                </div>
                                <div className="truncate font-medium text-slate-600" title={user.account}>{user.account}</div>
                                <div className="flex flex-wrap gap-1.5">
                                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">{user.role}</span>
                                </div>
                                <div className="flex justify-center">
                                  <div className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                                    <button
                                      onClick={() => setPermissionAction({ type: 'removeDepartmentMember', department: selectedDepartment, user })}
                                      className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-slate-400 transition-all hover:bg-red-50 hover:text-red-600"
                                      title={`将 ${user.name} 移出当前部门`}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      移出
                                    </button>
                                    <button
                                      onClick={() => setPermissionAction({ type: 'changeDepartmentMember', department: selectedDepartment, user })}
                                      className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-blue-500 transition-all hover:bg-blue-50 hover:text-blue-700"
                                      title={`为 ${user.name} 更换部门`}
                                    >
                                      <Workflow className="h-3.5 w-3.5" />
                                      更换
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-10 text-center text-sm text-slate-400">当前部门暂无示例成员</div>
                          )}
                        </div>
                        {selectedDepartmentDisplayMembers.length > 0 && (
                          <div className="flex items-center justify-end border-t border-slate-200 bg-white px-4 py-3">
                            <div className="inline-flex items-center gap-2.5">
                              <span className="text-sm font-medium text-slate-600">
                                共 {selectedDepartmentDisplayMembers.length} 条
                              </span>
                              <button
                                onClick={() => setPermissionPage(prev => Math.max(1, prev - 1))}
                                disabled={permissionPage === 1}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                              >
                                <ChevronLeft className="h-4 w-4 text-slate-600" />
                              </button>
                              <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-900">
                                {Math.min(permissionPage, permissionTotalPages)}
                              </span>
                              <button
                                onClick={() => setPermissionPage(prev => Math.min(permissionTotalPages, prev + 1))}
                                disabled={permissionPage === permissionTotalPages}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                              >
                                <ChevronRightIcon className="h-4 w-4 text-slate-600" />
                              </button>
                              <div className="relative">
                                <select
                                  value={permissionItemsPerPage}
                                  onChange={(e) => {
                                    setPermissionItemsPerPage(Number(e.target.value));
                                    setPermissionPage(1);
                                  }}
                                  className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-blue-200 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                                >
                                  <option value={10}>10 条/页</option>
                                  <option value={20}>20 条/页</option>
                                  <option value={50}>50 条/页</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {permissionSection !== 'departments' && permissionPaginationSource.length > 0 && (
                  <div className="flex items-center justify-end border-t border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="inline-flex items-center gap-2.5">
                      <span className="text-sm font-medium text-slate-600">
                        共 {permissionPaginationSource.length} 条
                      </span>
                      <button
                        onClick={() => setPermissionPage(prev => Math.max(1, prev - 1))}
                        disabled={permissionPage === 1}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      >
                        <ChevronLeft className="h-4 w-4 text-slate-600" />
                      </button>
                      <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-900">
                        {Math.min(permissionPage, permissionTotalPages)}
                      </span>
                      <button
                        onClick={() => setPermissionPage(prev => Math.min(permissionTotalPages, prev + 1))}
                        disabled={permissionPage === permissionTotalPages}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      >
                        <ChevronRightIcon className="h-4 w-4 text-slate-600" />
                      </button>
                      <div className="relative">
                        <select
                          value={permissionItemsPerPage}
                          onChange={(e) => {
                            setPermissionItemsPerPage(Number(e.target.value));
                            setPermissionPage(1);
                          }}
                          className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-blue-200 hover:text-blue-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                        >
                          <option value={10}>10 条/页</option>
                          <option value={20}>20 条/页</option>
                          <option value={50}>50 条/页</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : activeModule === 'skill' ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
            <div className="flex-1 overflow-y-auto px-8 py-6 no-scrollbar">
              <div className="max-w-[1600px] mx-auto">
                <SkillCenterPage
                  activePageKey={activeSkillPage.key}
                  activePageLabel={activeSkillPage.label}
                  onNotify={showToast}
                />
              </div>
            </div>
          </div>
        ) : showNewKBPage ? (
          // 新建知识库页面
          <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
            {/* 顶部导航栏 - 只保留返回和标题 */}
            <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowCancelConfirmModal(true)}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="font-medium">返回</span>
                </button>
                <div className="h-6 w-px bg-slate-200"></div>
                <h2 className="text-lg font-bold text-slate-800">{editingNewKBId ? '编辑知识库' : '新建知识库'}</h2>
              </div>
            </div>

            {/* 简化创建知识库页面 */}
            <div className="flex-1 overflow-y-auto px-8 py-8 pb-28">
              <div className="max-w-[1120px] mx-auto space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-8 py-6 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-1 h-6 bg-blue-600 rounded-full" />
                      知识库基础信息
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">设置知识库头像、名称和简介，便于后续识别和管理。</p>
                  </div>
                  <div className="p-8 grid grid-cols-[120px_1fr] gap-8">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-3">头像</label>
                      <div className="relative group">
                        {newKBConfig.iconUrl ? (
                          <img
                            src={newKBConfig.iconUrl}
                            alt="知识库头像"
                            onClick={() => document.getElementById('simple-kb-avatar-upload')?.click()}
                            className="w-20 h-20 rounded-2xl object-cover border border-slate-200 cursor-pointer hover:opacity-80 transition-all"
                          />
                        ) : (
                          <button
                            onClick={() => document.getElementById('simple-kb-avatar-upload')?.click()}
                            className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50 flex flex-col items-center justify-center transition-all"
                          >
                            <Upload className="w-5 h-5 text-slate-400 mb-1" />
                            <span className="text-xs text-slate-400">上传</span>
                          </button>
                        )}
                        <input
                          id="simple-kb-avatar-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => setNewKBConfig({ ...newKBConfig, iconUrl: reader.result as string });
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">名称 <span className="text-red-500">*</span></label>
                        <input
                          value={newKBConfig.name}
                          onChange={(e) => setNewKBConfig({ ...newKBConfig, name: e.target.value.slice(0, 50) })}
                          placeholder="请输入知识库名称"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">简介 <span className="text-red-500">*</span></label>
                        <textarea
                          value={newKBConfig.description}
                          onChange={(e) => setNewKBConfig({ ...newKBConfig, description: e.target.value.slice(0, 200) })}
                          placeholder="请描述知识库的用途和内容"
                          rows={5}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                        />
                        <div className="text-right text-xs text-slate-400 mt-1">{newKBConfig.description.length}/200</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700">知识库标签</label>
                            <p className="mt-1 text-xs text-slate-500">用于知识库分类、筛选和快速识别</p>
                          </div>
                          <span className="text-xs text-slate-400">{newKBConfig.tags.length}/10</span>
                        </div>
                        {newKBConfig.tags.length > 0 && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {newKBConfig.tags.map((tag) => (
                              <span key={tag} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-sm text-blue-700">
                                #{tag}
                                <button
                                  type="button"
                                  onClick={() => setNewKBConfig({ ...newKBConfig, tags: newKBConfig.tags.filter(t => t !== tag) })}
                                  className="text-blue-400 hover:text-blue-700"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="输入标签名称"
                            onKeyDown={(e) => {
                              const nextTag = e.currentTarget.value.trim();
                              if (e.key === 'Enter' && nextTag && !newKBConfig.tags.includes(nextTag) && newKBConfig.tags.length < 10) {
                                setNewKBConfig({ ...newKBConfig, tags: [...newKBConfig.tags, nextTag] });
                                e.currentTarget.value = '';
                              }
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                              const nextTag = input?.value.trim();
                              if (nextTag && !newKBConfig.tags.includes(nextTag) && newKBConfig.tags.length < 10) {
                                setNewKBConfig({ ...newKBConfig, tags: [...newKBConfig.tags, nextTag] });
                                input.value = '';
                              }
                            }}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                          >
                            添加
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {recommendedTags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              disabled={newKBConfig.tags.includes(tag) || newKBConfig.tags.length >= 10}
                              onClick={() => setNewKBConfig({ ...newKBConfig, tags: [...newKBConfig.tags, tag] })}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                                newKBConfig.tags.includes(tag)
                                  ? 'border-slate-200 bg-white text-slate-300'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600'
                              } disabled:cursor-not-allowed`}
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-8 py-6 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-1 h-6 bg-blue-600 rounded-full" />
                      权限管理
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">选择知识库可见范围；这里使用预设模板快速初始化权限，隐藏底层角色勾选。</p>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { value: 'public', label: '公开', desc: '所有企业成员都可以访问', icon: Globe },
                        { value: 'private', label: '私有', desc: '仅创建者本人可访问', icon: Lock },
                        { value: 'partial', label: '部分公开', desc: '仅指定部门或人员可见', icon: Users }
                      ].map((item) => (
                        <button
                          key={item.value}
                          onClick={() => setNewKBConfig({ ...newKBConfig, permissionType: item.value })}
                          className={`relative p-5 rounded-xl border-2 text-left transition-all ${
                            newKBConfig.permissionType === item.value
                              ? 'border-blue-500 bg-blue-50 shadow-sm'
                              : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${newKBConfig.permissionType === item.value ? 'bg-blue-100' : 'bg-slate-100'}`}>
                              <item.icon className={`w-5 h-5 ${newKBConfig.permissionType === item.value ? 'text-blue-600' : 'text-slate-500'}`} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{item.label}</div>
                              <div className="text-sm text-slate-500 mt-1">{item.desc}</div>
                            </div>
                          </div>
                          {newKBConfig.permissionType === item.value && (
                            <div className="absolute top-4 right-4 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    {newKBConfig.permissionType === 'partial' && (() => {
                      const permissionOptions = [
                        { value: 'view', label: '只读' },
                        { value: 'edit', label: '编辑' },
                        { value: 'manage', label: '管理' }
                      ] as const;
                      const departmentGroups = Array.from(mockTeams.reduce((map, team) => {
                        const current = map.get(team.department) || {
                          id: `department-${team.department}`,
                          name: team.department,
                          teams: [] as string[],
                          members: [] as Array<{ id: string; name: string; avatar?: string }>,
                          memberCount: 0
                        };
                        const memberMap = new Map(current.members.map(member => [member.id, member]));
                        team.members.forEach(member => memberMap.set(member.id, member));
                        current.teams = Array.from(new Set([...current.teams, team.name]));
                        current.members = Array.from(memberMap.values());
                        current.memberCount = current.members.length;
                        map.set(team.department, current);
                        return map;
                      }, new Map<string, any>()).values());
                      const scopeMembers = Array.from([...mockTeams.flatMap(team => team.members), ...mockRoles.flatMap(role => role.members)]
                        .reduce((map, member) => map.set(member.id, member), new Map<string, any>()).values());
                      const memberMeta = new Map(scopeMembers.map(member => [member.id, {
                        departments: departmentGroups.filter(department => department.members.some(item => item.id === member.id)).map(department => department.name),
                        roles: mockRoles.filter(role => role.members.some(item => item.id === member.id)).map(role => role.name)
                      }]));
                      const effectiveMembers = resolvePartialAccessMembers();
                      const candidateQuery = partialCandidateSearch.trim().toLowerCase();
                      const selectedQuery = partialSelectedSearch.trim().toLowerCase();
                      const filteredDepartments = departmentGroups.filter(department => {
                        const haystack = [department.name, ...department.teams, ...department.members.map(member => member.name)].join(' ').toLowerCase();
                        return !candidateQuery || haystack.includes(candidateQuery);
                      });
                      const filteredRoles = mockRoles.filter(role => {
                        const haystack = [role.name, ...role.members.map(member => member.name)].join(' ').toLowerCase();
                        return !candidateQuery || haystack.includes(candidateQuery);
                      });
                      const filteredScopeMembers = scopeMembers.filter(member => {
                        const meta = memberMeta.get(member.id) || { departments: [], roles: [] };
                        const haystack = [member.name, member.id, ...meta.departments, ...meta.roles].join(' ').toLowerCase();
                        return !candidateQuery || haystack.includes(candidateQuery);
                      });
                      const isMemberConfigured = (memberId: string) =>
                        selectedMembers.some(member => member.id === memberId) ||
                        teamPermissions.some(department => department.members.some(member => member.id === memberId) && !department.excludedMembers.includes(memberId)) ||
                        rolePermissions.some(role => role.members.some(member => member.id === memberId) && !role.excludedMembers.includes(memberId));
                      const visibleScopeMembers = filteredScopeMembers.filter(member =>
                        partialMemberConfigFilter === 'configured' ? isMemberConfigured(member.id) : !isMemberConfigured(member.id)
                      );
                      const configuredMemberCount = scopeMembers.filter(member => isMemberConfigured(member.id)).length;
                      const unconfiguredMemberCount = scopeMembers.length - configuredMemberCount;
                      const visibleEffectiveMembers = effectiveMembers.filter(member => {
                        const meta = memberMeta.get(member.id) || { departments: [], roles: [] };
                        const haystack = [member.name, member.id, ...meta.departments, ...meta.roles, ...member.sources].join(' ').toLowerCase();
                        const matchesSearch = !selectedQuery || haystack.includes(selectedQuery);
                        const matchesDepartment = partialSelectedDepartmentFilter === 'all' || meta.departments.includes(partialSelectedDepartmentFilter);
                        const matchesRole = partialSelectedRoleFilter === 'all' || meta.roles.includes(partialSelectedRoleFilter);
                        const matchesPermission = partialSelectedPermissionFilter === 'all' || member.permission === partialSelectedPermissionFilter;
                        return matchesSearch && matchesDepartment && matchesRole && matchesPermission;
                      });
                      const allVisibleSelected = visibleEffectiveMembers.length > 0 && visibleEffectiveMembers.every(member => selectedPartialMemberIds.includes(member.id));
                      const removeMembersFromScope = (memberIds: string[]) => {
                        const ids = Array.from(new Set(memberIds));
                        if (ids.length === 0) {
                          showToast('warning', '请先选择需要剔除的成员');
                          return;
                        }
                        setSelectedMembers(prev => prev.filter(member => !ids.includes(member.id)));
                        setRolePermissions(prev => prev.map(role => {
                          const excluded = role.members.filter(member => ids.includes(member.id)).map(member => member.id);
                          return excluded.length ? { ...role, excludedMembers: Array.from(new Set([...role.excludedMembers, ...excluded])) } : role;
                        }));
                        setTeamPermissions(prev => prev.map(department => {
                          const excluded = department.members.filter(member => ids.includes(member.id)).map(member => member.id);
                          return excluded.length ? { ...department, excludedMembers: Array.from(new Set([...department.excludedMembers, ...excluded])) } : department;
                        }));
                        setSelectedPartialMemberIds(prev => prev.filter(id => !ids.includes(id)));
                        showToast('success', `已剔除 ${ids.length} 个成员`);
                      };
                      const bulkAddDepartments = () => {
                        const targets = departmentGroups.filter(department => pendingPartialDepartmentIds.includes(department.id));
                        if (targets.length === 0) {
                          showToast('warning', '请先选择部门');
                          return;
                        }
                        setTeamPermissions(prev => {
                          const next = [...prev];
                          targets.forEach(department => {
                            const existingIndex = next.findIndex(item => item.teamId === department.id);
                            const nextPermission = {
                              teamId: department.id,
                              teamName: department.name,
                              memberCount: department.memberCount,
                              permission: partialBulkPermission,
                              members: department.members,
                              excludedMembers: [],
                              memberPermissions: Object.fromEntries(department.members.map(member => [member.id, partialBulkPermission]))
                            };
                            if (existingIndex >= 0) {
                              next[existingIndex] = { ...next[existingIndex], ...nextPermission };
                            } else {
                              next.push(nextPermission);
                            }
                          });
                          return next;
                        });
                        setPendingPartialDepartmentIds([]);
                        showToast('success', `已批量添加 ${targets.length} 个部门`);
                      };
                      const bulkAddRoles = () => {
                        const targets = mockRoles.filter(role => pendingPartialRoleIds.includes(role.id));
                        if (targets.length === 0) {
                          showToast('warning', '请先选择角色');
                          return;
                        }
                        setRolePermissions(prev => {
                          const next = [...prev];
                          targets.forEach(role => {
                            const existingIndex = next.findIndex(item => item.roleId === role.id);
                            const nextPermission = {
                              roleId: role.id,
                              roleName: role.name,
                              memberCount: role.memberCount,
                              permission: partialBulkPermission,
                              members: role.members,
                              excludedMembers: [],
                              memberPermissions: Object.fromEntries(role.members.map(member => [member.id, partialBulkPermission]))
                            };
                            if (existingIndex >= 0) {
                              next[existingIndex] = { ...next[existingIndex], ...nextPermission };
                            } else {
                              next.push(nextPermission);
                            }
                          });
                          return next;
                        });
                        setPendingPartialRoleIds([]);
                        showToast('success', `已批量添加 ${targets.length} 个角色`);
                      };

                      return (
                        <div className="pt-2">
                          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(460px,1.1fr)]">
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                              <div className="border-b border-slate-100 px-5 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-bold text-slate-900">添加授权范围</div>
                                    <div className="mt-1 text-xs text-slate-500">按部门、角色批量添加，也可以单独补充人员。</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">默认权限</span>
                                    <select
                                      value={partialBulkPermission}
                                      onChange={(e) => setPartialBulkPermission(e.target.value as 'view' | 'edit' | 'manage')}
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    >
                                      {permissionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
                                  {[
                                    { value: 'team', label: '部门', count: teamPermissions.length },
                                    { value: 'role', label: '角色', count: rolePermissions.length },
                                    { value: 'member', label: '人员', count: selectedMembers.length }
                                  ].map(item => (
                                    <button
                                      key={item.value}
                                      onClick={() => setSelectedPermissionTab(item.value as 'member' | 'role' | 'team')}
                                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                        selectedPermissionTab === item.value
                                          ? 'bg-white text-blue-700 shadow-sm'
                                          : 'text-slate-500 hover:text-slate-800'
                                      }`}
                                    >
                                      {item.label} <span className="ml-1 text-[11px]">{item.count}</span>
                                    </button>
                                  ))}
                                </div>
                                <div className="relative mt-4">
                                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                  <input
                                    value={partialCandidateSearch}
                                    onChange={(e) => setPartialCandidateSearch(e.target.value)}
                                    placeholder="搜索部门、角色或人员"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                  />
                                </div>
                              </div>

                              <div className="max-h-[500px] overflow-y-auto p-4">
                                {selectedPermissionTab === 'team' && (
                                  <section className="space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs text-slate-500">已勾选 {pendingPartialDepartmentIds.length} 个部门</div>
                                      <button
                                        onClick={bulkAddDepartments}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                                      >
                                        <Plus className="h-3.5 w-3.5" />批量添加
                                      </button>
                                    </div>
                                    {filteredDepartments.map(department => {
                                      const selectedPermission = teamPermissions.find(item => item.teamId === department.id);
                                      const checked = pendingPartialDepartmentIds.includes(department.id);
                                      return (
                                        <div key={department.id} className={`rounded-xl border bg-white p-3 transition ${checked || selectedPermission ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}>
                                          <div className="flex items-start gap-3">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => setPendingPartialDepartmentIds(prev => prev.includes(department.id) ? prev.filter(id => id !== department.id) : [...prev, department.id])}
                                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-semibold text-slate-900">{department.name}</div>
                                                {selectedPermission && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">已添加</span>}
                                              </div>
                                              <div className="mt-1 text-xs text-slate-500">{department.memberCount} 人 · 按部门范围继承权限</div>
                                              <div className="mt-2 flex flex-wrap gap-1.5">
                                                {department.members.slice(0, 6).map(member => (
                                                  <span key={member.id} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500">{member.name}</span>
                                                ))}
                                                {department.members.length > 6 && <span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-400">+{department.members.length - 6}</span>}
                                              </div>
                                            </div>
                                            {selectedPermission && (
                                              <select
                                                value={selectedPermission.permission}
                                                onChange={(e) => setTeamPermissions(teamPermissions.map(item => item.teamId === department.id ? {
                                                  ...item,
                                                  permission: e.target.value as 'view' | 'edit' | 'manage',
                                                  memberPermissions: Object.fromEntries(item.members.map(member => [member.id, e.target.value as 'view' | 'edit' | 'manage']))
                                                } : item))}
                                                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                                              >
                                                {permissionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                              </select>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </section>
                                )}

                                {selectedPermissionTab === 'role' && (
                                  <section className="space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs text-slate-500">已勾选 {pendingPartialRoleIds.length} 个角色</div>
                                      <button
                                        onClick={bulkAddRoles}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                                      >
                                        <Plus className="h-3.5 w-3.5" />批量添加
                                      </button>
                                    </div>
                                    {filteredRoles.map(role => {
                                      const selectedPermission = rolePermissions.find(item => item.roleId === role.id);
                                      const checked = pendingPartialRoleIds.includes(role.id);
                                      return (
                                        <div key={role.id} className={`rounded-xl border bg-white p-3 transition ${checked || selectedPermission ? 'border-purple-200 ring-1 ring-purple-100' : 'border-slate-200 hover:border-slate-300'}`}>
                                          <div className="flex items-start gap-3">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => setPendingPartialRoleIds(prev => prev.includes(role.id) ? prev.filter(id => id !== role.id) : [...prev, role.id])}
                                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-semibold text-slate-900">{role.name}</div>
                                                {selectedPermission && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">已添加</span>}
                                              </div>
                                              <div className="mt-1 text-xs text-slate-500">{role.memberCount} 人 · 按角色继承权限</div>
                                              <div className="mt-2 flex flex-wrap gap-1.5">
                                                {role.members.slice(0, 6).map(member => (
                                                  <span key={member.id} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500">{member.name}</span>
                                                ))}
                                              </div>
                                            </div>
                                            {selectedPermission && (
                                              <select
                                                value={selectedPermission.permission}
                                                onChange={(e) => setRolePermissions(rolePermissions.map(item => item.roleId === role.id ? {
                                                  ...item,
                                                  permission: e.target.value as 'view' | 'edit' | 'manage',
                                                  memberPermissions: Object.fromEntries(item.members.map(member => [member.id, e.target.value as 'view' | 'edit' | 'manage']))
                                                } : item))}
                                                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                                              >
                                                {permissionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                              </select>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </section>
                                )}

                                {selectedPermissionTab === 'member' && (
                                  <section className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                                      {[
                                        { value: 'unconfigured', label: '未配置', count: unconfiguredMemberCount },
                                        { value: 'configured', label: '已配置', count: configuredMemberCount }
                                      ].map(item => (
                                        <button
                                          key={item.value}
                                          onClick={() => setPartialMemberConfigFilter(item.value as 'unconfigured' | 'configured')}
                                          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                            partialMemberConfigFilter === item.value
                                              ? 'bg-white text-blue-700 shadow-sm'
                                              : 'text-slate-500 hover:text-slate-800'
                                          }`}
                                        >
                                          {item.label} <span className="ml-1 text-[11px]">{item.count}</span>
                                        </button>
                                      ))}
                                    </div>

                                    {visibleScopeMembers.slice(0, 16).map(member => {
                                      const selectedPermission = selectedMembers.find(item => item.id === member.id);
                                      const directSelected = Boolean(selectedPermission);
                                      const configured = isMemberConfigured(member.id);
                                      const meta = memberMeta.get(member.id) || { departments: [], roles: [] };
                                      return (
                                        <div key={member.id} className={`rounded-xl border bg-white p-3 transition ${configured ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}>
                                          <div className="flex items-start gap-3">
                                            <button
                                              onClick={() => {
                                                if (directSelected) {
                                                  setSelectedMembers(selectedMembers.filter(item => item.id !== member.id));
                                                } else {
                                                  setSelectedMembers([...selectedMembers, { id: member.id, name: member.name, permission: partialBulkPermission }]);
                                                }
                                              }}
                                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${configured ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                                            >
                                              {configured ? <Check className="h-4 w-4" /> : member.name.charAt(0)}
                                            </button>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold text-slate-900">{member.name}</span>
                                                {configured && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">已配置</span>}
                                                {configured && !directSelected && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">继承配置</span>}
                                              </div>
                                              <div className="mt-1 text-xs text-slate-500">{meta.departments.join('、') || '未归属部门'} · {meta.roles.join('、') || '无角色'}</div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                              {directSelected && (
                                              <select
                                                value={selectedPermission?.permission || 'view'}
                                                onChange={(e) => setSelectedMembers(selectedMembers.map(item => item.id === member.id ? { ...item, permission: e.target.value as 'view' | 'edit' | 'manage' } : item))}
                                                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                                              >
                                                {permissionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                              </select>
                                              )}
                                              <button
                                                onClick={() => {
                                                  if (directSelected) {
                                                    setSelectedMembers(selectedMembers.filter(item => item.id !== member.id));
                                                  } else {
                                                    setSelectedMembers([...selectedMembers, { id: member.id, name: member.name, permission: partialBulkPermission }]);
                                                  }
                                                }}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                                  directSelected
                                                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                                }`}
                                              >
                                                {directSelected ? '移除' : configured ? '单独配置' : '添加'}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {visibleScopeMembers.length === 0 && (
                                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
                                        当前筛选下暂无{partialMemberConfigFilter === 'configured' ? '已配置' : '未配置'}人员
                                      </div>
                                    )}
                                  </section>
                                )}
                              </div>
                            </div>

                            <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                              <div className="border-b border-slate-100 px-5 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-bold text-slate-900">已选范围</div>
                                    <div className="mt-1 text-xs text-slate-500">可按成员、部门、角色、权限筛选，筛选后支持批量剔除。</div>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">部门 {teamPermissions.length}</span>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">角色 {rolePermissions.length}</span>
                                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">成员 {effectiveMembers.length}</span>
                                  </div>
                                </div>
                                <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_120px_120px_110px]">
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                    <input
                                      value={partialSelectedSearch}
                                      onChange={(e) => setPartialSelectedSearch(e.target.value)}
                                      placeholder="搜索姓名 / 部门 / 角色"
                                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                                    />
                                  </div>
                                  <select
                                    value={partialSelectedDepartmentFilter}
                                    onChange={(e) => setPartialSelectedDepartmentFilter(e.target.value)}
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600 outline-none focus:border-blue-500"
                                  >
                                    <option value="all">全部部门</option>
                                    {departmentGroups.map(department => <option key={department.id} value={department.name}>{department.name}</option>)}
                                  </select>
                                  <select
                                    value={partialSelectedRoleFilter}
                                    onChange={(e) => setPartialSelectedRoleFilter(e.target.value)}
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600 outline-none focus:border-blue-500"
                                  >
                                    <option value="all">全部角色</option>
                                    {mockRoles.map(role => <option key={role.id} value={role.name}>{role.name}</option>)}
                                  </select>
                                  <select
                                    value={partialSelectedPermissionFilter}
                                    onChange={(e) => setPartialSelectedPermissionFilter(e.target.value as 'all' | 'view' | 'edit' | 'manage')}
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600 outline-none focus:border-blue-500"
                                  >
                                    <option value="all">全部权限</option>
                                    {permissionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                  </select>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                  <button
                                    onClick={() => {
                                      setPartialSelectedSearch('');
                                      setPartialSelectedDepartmentFilter('all');
                                      setPartialSelectedRoleFilter('all');
                                      setPartialSelectedPermissionFilter('all');
                                    }}
                                    className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
                                  >
                                    清空筛选
                                  </button>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      onClick={() => setSelectedPartialMemberIds(allVisibleSelected ? [] : visibleEffectiveMembers.map(member => member.id))}
                                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                      {allVisibleSelected ? '取消全选' : '全选当前'}
                                    </button>
                                    <button
                                      onClick={() => removeMembersFromScope(selectedPartialMemberIds)}
                                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                                    >
                                      批量剔除
                                    </button>
                                    <button
                                      onClick={() => removeMembersFromScope(visibleEffectiveMembers.map(member => member.id))}
                                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                                    >
                                      剔除筛选结果
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="max-h-[500px] overflow-y-auto p-4">
                                {visibleEffectiveMembers.length > 0 ? (
                                  <div className="space-y-2">
                                    {visibleEffectiveMembers.map(member => {
                                      const meta = memberMeta.get(member.id) || { departments: [], roles: [] };
                                      const checked = selectedPartialMemberIds.includes(member.id);
                                      return (
                                        <div key={member.id} className={`rounded-xl border p-3 transition ${checked ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                          <div className="flex items-start gap-3">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => setSelectedPartialMemberIds(prev => prev.includes(member.id) ? prev.filter(id => id !== member.id) : [...prev, member.id])}
                                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold text-slate-900">{member.name}</span>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${permissionTone[member.permission]}`}>{permissionText[member.permission]}</span>
                                              </div>
                                              <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                                                <div>
                                                  <span className="text-slate-400">角色：</span>
                                                  {meta.roles.length ? meta.roles.join('、') : '无角色'}
                                                </div>
                                              </div>
                                              <div className="mt-2 flex flex-wrap gap-1.5">
                                                {member.sources.map(source => (
                                                  <span key={source} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">{source}</span>
                                                ))}
                                              </div>
                                            </div>
                                            <button
                                              onClick={() => removeMembersFromScope([member.id])}
                                              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                                            >
                                              剔除
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center">
                                    <Users className="mb-3 h-8 w-8 text-slate-300" />
                                    <div className="text-sm font-semibold text-slate-600">暂无已选范围</div>
                                    <p className="mt-1 max-w-[260px] text-xs leading-5 text-slate-400">从左侧批量添加部门或角色后，这里会显示最终可访问人员、来源和权限。</p>
                                  </div>
                                )}
                              </div>
                            </aside>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className={`fixed bottom-0 right-0 bg-white border-t border-slate-200 px-8 py-4 flex items-center justify-between z-30 shadow-lg transition-all ${isSidebarCollapsed ? 'left-20' : 'left-64'}`}>
              <button
                onClick={() => setShowCancelConfirmModal(true)}
                className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-all"
              >
                取消
              </button>
              <button
                onClick={() => createKnowledgeBaseFromForm()}
                disabled={isCreatingKB || !newKBConfig.name || !newKBConfig.description}
                className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 flex items-center gap-2"
              >
                {isCreatingKB ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{editingNewKBId ? '保存中...' : '创建中...'}</> : editingNewKBId ? '保存' : '创建'}
              </button>
            </div>

            <div className="hidden">
            {/* 步骤指示器 */}
            <div className="bg-white border-b border-slate-200/60 px-8 py-4">
              <div className="max-w-[1200px] mx-auto">
                <div className="flex items-center justify-between relative">
                  {[
                    { num: 1, label: '基础信息与权限' },
                    { num: 2, label: '检索配置' },
                    { num: 3, label: '确认创建' }
                  ].map((step, index) => (
                    <div key={step.num} className="flex items-center flex-1">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`relative flex items-center justify-center w-9 h-9 rounded-lg font-semibold text-sm transition-all ${
                          newKBStep === step.num
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                            : newKBStep > step.num
                            ? 'bg-green-500 text-white'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {newKBStep > step.num ? '✓' : step.num}
                        </div>
                        <div className="flex-1">
                          <div className={`font-medium text-sm ${
                            newKBStep === step.num ? 'text-blue-600' : newKBStep > step.num ? 'text-green-600' : 'text-slate-400'
                          }`}>
                            {step.label}
                          </div>
                        </div>
                      </div>
                      {index < 2 && (
                        <div className={`h-0.5 w-16 mx-3 transition-all ${
                          newKBStep > step.num ? 'bg-green-500' : 'bg-slate-200'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 内容区域 - 为底部固定按钮留出空间 */}
            <div className="flex-1 overflow-y-auto px-8 py-8 pb-24">
              <div className="max-w-[1200px] mx-auto">
                {/* 步骤一：基础信息与权限 */}
                {newKBStep === 1 && (
                  <div className="space-y-6 max-w-[920px] mx-auto">
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
                        基础信息与权限
                      </h3>
                      
                      <div className="space-y-6">
                        {/* 图标和名称 */}
                        <div className="grid grid-cols-[auto_1fr] gap-6">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">知识库图标</label>
                            <div className="relative group">
                              {newKBConfig.iconUrl ? (
                                <div className="relative">
                                  <img 
                                    src={newKBConfig.iconUrl} 
                                    alt="知识库图标"
                                    className="w-20 h-20 rounded-xl object-cover cursor-pointer hover:opacity-80 transition-all border-2 border-slate-200"
                                    onClick={() => document.getElementById('icon-upload')?.click()}
                                  />
                                  <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Upload className="w-4 h-4 text-white" />
                                  </div>
                                </div>
                              ) : (
                                <div 
                                  className="w-20 h-20 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group"
                                  onClick={() => document.getElementById('icon-upload')?.click()}
                                >
                                  <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-500 mb-1" />
                                  <span className="text-[10px] text-slate-400 group-hover:text-blue-500">上传图标</span>
                                </div>
                              )}
                              <input
                                id="icon-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setNewKBConfig({...newKBConfig, iconUrl: reader.result as string});
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                              知识库名称 <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={newKBConfig.name}
                                onChange={(e) => {
                                  if (e.target.value.length <= 50) {
                                    setNewKBConfig({...newKBConfig, name: e.target.value});
                                  }
                                }}
                                placeholder="请输入知识库名称"
                                maxLength={50}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                              />
                              <div className="absolute right-3 top-3 text-xs text-slate-400">
                                {newKBConfig.name.length}/50
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 描述 */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-3">
                            知识库描述 <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <textarea
                              value={newKBConfig.description}
                              onChange={(e) => {
                                if (e.target.value.length <= 200) {
                                  setNewKBConfig({...newKBConfig, description: e.target.value});
                                }
                              }}
                              placeholder="请描述知识库的用途和内容"
                              rows={4}
                              maxLength={200}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                            />
                            <div className="absolute right-3 bottom-3 text-xs text-slate-400">
                              {newKBConfig.description.length}/200
                            </div>
                          </div>
                        </div>

                        {/* 标签 */}
                        <div>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <label className="block text-sm font-medium text-slate-700">标签维护</label>
                              <p className="mt-1 text-xs text-slate-500">为知识库添加业务标签，也可以维护常用推荐标签</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowTagManageModal(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                            >
                              <Settings className="w-3.5 h-3.5" />
                              管理标签
                            </button>
                          </div>
                          
                          {/* 已添加的标签 */}
                          {newKBConfig.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {newKBConfig.tags.map((tag, index) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm border border-blue-200"
                                >
                                  {tag}
                                  <button
                                    onClick={() => {
                                      const newTags = newKBConfig.tags.filter((_, i) => i !== index);
                                      setNewKBConfig({...newKBConfig, tags: newTags});
                                    }}
                                    className="hover:text-blue-900 ml-1"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          
                          {/* 输入框 */}
                          <div className="flex gap-2 mb-4">
                            <input
                              type="text"
                              placeholder="输入标签名称"
                              onKeyPress={(e) => {
                                const nextTag = e.currentTarget.value.trim();
                                if (e.key === 'Enter' && nextTag && !newKBConfig.tags.includes(nextTag)) {
                                  setNewKBConfig({
                                    ...newKBConfig,
                                    tags: [...newKBConfig.tags, nextTag]
                                  });
                                  e.currentTarget.value = '';
                                }
                              }}
                              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                            />
                            <button
                              onClick={(e) => {
                                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                const nextTag = input?.value.trim();
                                if (nextTag && !newKBConfig.tags.includes(nextTag)) {
                                  setNewKBConfig({
                                    ...newKBConfig,
                                    tags: [...newKBConfig.tags, nextTag]
                                  });
                                  input.value = '';
                                }
                              }}
                              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-sm text-sm"
                            >
                              添加
                            </button>
                          </div>
                          
                          {/* 推荐标签 */}
                          <div>
                            <div className="mb-2.5 flex items-center justify-between gap-3">
                              <div className="text-sm text-slate-600">推荐标签：</div>
                              <button
                                type="button"
                                onClick={() => setShowTagManageModal(true)}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700"
                              >
                                维护推荐标签
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {recommendedTags.map((suggestedTag) => (
                                <button
                                  key={suggestedTag}
                                  onClick={() => {
                                    if (!newKBConfig.tags.includes(suggestedTag)) {
                                      setNewKBConfig({
                                        ...newKBConfig,
                                        tags: [...newKBConfig.tags, suggestedTag]
                                      });
                                    }
                                  }}
                                  disabled={newKBConfig.tags.includes(suggestedTag)}
                                  className={`group px-3 py-1.5 rounded-lg text-sm transition-all ${
                                    newKBConfig.tags.includes(suggestedTag)
                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                      : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 hover:shadow-sm'
                                  }`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    {!newKBConfig.tags.includes(suggestedTag) && (
                                      <Plus className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                    {suggestedTag}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* 访问范围 */}
                        <div className="pt-4 border-t border-slate-200">
                          <label className="block text-sm font-medium text-slate-700 mb-3">访问范围</label>
                          <div className="grid grid-cols-2 gap-4">
                            {[
                              { 
                                value: 'private', 
                                label: '私有知识库', 
                                icon: Lock,
                                desc: '仅自己和授权成员可访问' 
                              },
                              { 
                                value: 'public', 
                                label: '公开知识库', 
                                icon: Globe,
                                desc: '所有企业成员都可以访问' 
                              }
                            ].map((type) => (
                              <button
                                key={type.value}
                                onClick={() => setNewKBConfig({...newKBConfig, permissionType: type.value as 'public' | 'private'})}
                                className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                  newKBConfig.permissionType === type.value
                                    ? 'border-blue-500 bg-blue-50 shadow-md'
                                    : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`p-2 rounded-lg ${
                                    newKBConfig.permissionType === type.value
                                      ? 'bg-blue-100'
                                      : 'bg-slate-100'
                                  }`}>
                                    <type.icon className={`w-4 h-4 ${
                                      newKBConfig.permissionType === type.value
                                        ? 'text-blue-600'
                                        : 'text-slate-500'
                                    }`} />
                                  </div>
                                  <div className="flex-1">
                                    <div className={`font-semibold text-sm mb-1 ${
                                      newKBConfig.permissionType === type.value
                                        ? 'text-blue-700'
                                        : 'text-slate-800'
                                    }`}>
                                      {type.label}
                                    </div>
                                    <div className="text-xs text-slate-500 leading-relaxed">{type.desc}</div>
                                  </div>
                                  {newKBConfig.permissionType === type.value && (
                                    <div className="absolute top-3 right-3">
                                      <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* 私有知识库权限配置 */}
                          {newKBConfig.permissionType === 'private' && (
                            <div className="mt-6 space-y-4">
                              {/* 权限配置主体 - 左右分栏 */}
                              <div className="grid grid-cols-2 gap-6">
                                {/* 左侧：选择团队/成员 */}
                                <div className="space-y-4">
                                  {/* 标签切换 */}
                                  <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                                    <button
                                      onClick={() => setSelectedPermissionTab('team')}
                                      className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                        selectedPermissionTab === 'team'
                                          ? 'bg-white text-blue-600 shadow-sm'
                                          : 'text-slate-600 hover:text-slate-800'
                                      }`}
                                    >
                                      <div className="flex items-center justify-center gap-2">
                                        <Users className="w-4 h-4" />
                                        团队权限
                                      </div>
                                    </button>
                                    <button
                                      onClick={() => setSelectedPermissionTab('member')}
                                      className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                        selectedPermissionTab === 'member'
                                          ? 'bg-white text-blue-600 shadow-sm'
                                          : 'text-slate-600 hover:text-slate-800'
                                      }`}
                                    >
                                      <div className="flex items-center justify-center gap-2">
                                        <User className="w-4 h-4" />
                                        成员权限
                                      </div>
                                    </button>
                                  </div>

                                  {/* 管理入口提示 */}
                                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3">
                                    <div className="flex items-start gap-2">
                                      <div className="text-blue-600 mt-0.5">
                                        <Settings className="w-4 h-4" />
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-xs text-blue-700 mb-2">
                                          {selectedPermissionTab === 'team' ? '没有找到需要的团队？' : '没有找到需要的成员？'}
                                        </p>
                                        <button
                                          onClick={() => {
                                            if (selectedPermissionTab === 'team') {
                                              setShowManageTeamModal(true);
                                            } else {
                                              setShowManageMemberModal(true);
                                            }
                                          }}
                                          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:gap-2 transition-all"
                                        >
                                          <Plus className="w-3 h-3" />
                                          {selectedPermissionTab === 'team' ? '管理团队' : '管理成员'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 团队选择 */}
                                  {selectedPermissionTab === 'team' && (
                                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                                      {/* 搜索框 */}
                                      <div className="mb-4">
                                        <div className="relative">
                                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                          <input
                                            type="text"
                                            placeholder="搜索团队..."
                                            value={collaboratorSearchQuery}
                                            onChange={(e) => setCollaboratorSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          />
                                        </div>
                                      </div>

                                      {/* 已添加的团队 */}
                                      {teamPermissions.length > 0 && (
                                        <div className="mb-4">
                                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">已添加的团队</h3>
                                          <div className="space-y-2">
                                            {teamPermissions.map((tp, index) => (
                                              <div key={tp.teamId} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                                                <div className="flex items-center gap-3">
                                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                                                    <Users className="w-4 h-4" />
                                                  </div>
                                                  <div>
                                                    <div className="text-sm font-medium text-slate-800">{tp.teamName}</div>
                                                    <div className="text-xs text-slate-500">{tp.memberCount}人</div>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <select
                                                    value={tp.permission}
                                                    onChange={(e) => {
                                                      const newPermission = e.target.value as 'view' | 'edit' | 'manage';
                                                      const newPermissions = [...teamPermissions];
                                                      newPermissions[index].permission = newPermission;
                                                      const updatedMemberPermissions: Record<string, 'view' | 'edit' | 'manage'> = {};
                                                      tp.members.forEach(member => {
                                                        updatedMemberPermissions[member.id] = newPermission;
                                                      });
                                                      newPermissions[index].memberPermissions = updatedMemberPermissions;
                                                      setTeamPermissions(newPermissions);
                                                    }}
                                                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                  >
                                                    <option value="view">可查看</option>
                                                    <option value="edit">可编辑</option>
                                                    <option value="manage">可管理</option>
                                                  </select>
                                                  <button
                                                    onClick={() => {
                                                      setTeamPermissions(teamPermissions.filter((_, i) => i !== index));
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                  >
                                                    <X className="w-4 h-4" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* 可添加的团队列表 */}
                                      <div>
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">可添加的团队</h3>
                                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                                          {mockTeams
                                            .filter(team => 
                                              !teamPermissions.find(tp => tp.teamId === team.id) &&
                                              (collaboratorSearchQuery === '' || team.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()))
                                            )
                                            .map(team => (
                                              <div
                                                key={team.id}
                                                onClick={() => {
                                                  const memberPerms: Record<string, 'view' | 'edit'> = {};
                                                  team.members.forEach(member => {
                                                    memberPerms[member.id] = 'view';
                                                  });
                                                  
                                                  setTeamPermissions([...teamPermissions, {
                                                    teamId: team.id,
                                                    teamName: team.name,
                                                    memberCount: team.memberCount,
                                                    permission: 'view',
                                                    members: team.members,
                                                    excludedMembers: [],
                                                    memberPermissions: memberPerms
                                                  }]);
                                                }}
                                                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group"
                                              >
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-sm font-medium">
                                                  <Users className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1">
                                                  <div className="text-sm font-medium text-slate-800">{team.name}</div>
                                                  <div className="text-xs text-slate-500">{team.memberCount}人</div>
                                                </div>
                                                <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                                              </div>
                                            ))}
                                          {mockTeams.filter(team => 
                                            !teamPermissions.find(tp => tp.teamId === team.id) &&
                                            (collaboratorSearchQuery === '' || team.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()))
                                          ).length === 0 && (
                                            <div className="text-center py-8 text-slate-400">
                                              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                              <p className="text-sm">没有找到团队</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* 成员选择 */}
                                  {selectedPermissionTab === 'member' && (
                                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                                      {/* 搜索框 */}
                                      <div className="mb-4">
                                        <div className="relative">
                                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                          <input
                                            type="text"
                                            placeholder="搜索成员..."
                                            value={collaboratorSearchQuery}
                                            onChange={(e) => setCollaboratorSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          />
                                        </div>
                                      </div>

                                      {/* 已添加的成员 */}
                                      {selectedMembers.length > 0 && (
                                        <div className="mb-4">
                                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">已添加的成员</h3>
                                          <div className="space-y-2">
                                            {selectedMembers.map((member, index) => (
                                              <div key={member.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                                                <div className="flex items-center gap-3">
                                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                                                    member.permission === 'edit'
                                                      ? 'bg-gradient-to-br from-green-400 to-green-600'
                                                      : 'bg-gradient-to-br from-blue-400 to-blue-600'
                                                  }`}>
                                                    {member.name.charAt(0)}
                                                  </div>
                                                  <div>
                                                    <div className="text-sm font-medium text-slate-800">{member.name}</div>
                                                    <div className="text-xs text-slate-500">{member.id}</div>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <select
                                                    value={member.permission}
                                                    onChange={(e) => {
                                                      const newMembers = [...selectedMembers];
                                                      newMembers[index].permission = e.target.value as 'view' | 'edit' | 'manage';
                                                      setSelectedMembers(newMembers);
                                                    }}
                                                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                  >
                                                    <option value="view">可查看</option>
                                                    <option value="edit">可编辑</option>
                                                    <option value="manage">可管理</option>
                                                  </select>
                                                  <button
                                                    onClick={() => {
                                                      setSelectedMembers(selectedMembers.filter((_, i) => i !== index));
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                  >
                                                    <X className="w-4 h-4" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* 可添加的成员列表 */}
                                      <div>
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">可添加的成员</h3>
                                        <div className="space-y-1 max-h-[300px] overflow-y-auto">
                                          {allMembers
                                            .filter(member => 
                                              !selectedMembers.find(m => m.id === member.id) &&
                                              (collaboratorSearchQuery === '' || member.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()))
                                            )
                                            .map(member => (
                                              <div
                                                key={member.id}
                                                onClick={() => {
                                                  setSelectedMembers([...selectedMembers, {
                                                    id: member.id,
                                                    name: member.name,
                                                    permission: 'view'
                                                  }]);
                                                }}
                                                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group"
                                              >
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-sm font-medium">
                                                  {member.name.charAt(0)}
                                                </div>
                                                <div className="flex-1">
                                                  <div className="text-sm font-medium text-slate-800">{member.name}</div>
                                                  <div className="text-xs text-slate-500">{member.id}</div>
                                                </div>
                                                <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                                              </div>
                                            ))}
                                          {allMembers.filter(member => 
                                            !selectedMembers.find(m => m.id === member.id) &&
                                            (collaboratorSearchQuery === '' || member.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()))
                                          ).length === 0 && (
                                            <div className="text-center py-8 text-slate-400">
                                              <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                              <p className="text-sm">没有找到成员</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* 右侧：成员预览与管理 */}
                                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 max-h-[600px] overflow-y-auto">
                                  <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                                    <Eye className="w-4 h-4" />
                                    权限预览与管理
                                  </h4>
                                  
                                  {(teamPermissions.length > 0 || selectedMembers.length > 0) ? (
                                    <div className="space-y-3">
                                      {/* 统计信息 */}
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white rounded-lg p-3 text-center">
                                          <div className="text-xl font-bold text-blue-600">{teamPermissions.length}</div>
                                          <div className="text-xs text-slate-600 mt-1">团队</div>
                                        </div>
                                        <div className="bg-white rounded-lg p-3 text-center">
                                          <div className="text-xl font-bold text-green-600">{selectedMembers.length}</div>
                                          <div className="text-xs text-slate-600 mt-1">成员</div>
                                        </div>
                                      </div>
                                      
                                      {/* 团队预览 - 可展开查看成员 */}
                                      {selectedPermissionTab === 'team' && teamPermissions.length > 0 && (
                                        <div className="space-y-2">
                                          {teamPermissions.map(tp => {
                                            const isExpanded = expandedTeamId === tp.teamId;
                                            const filteredMembers = tp.members.filter(m => !tp.excludedMembers.includes(m.id));
                                            const excludedMembersList = tp.members.filter(m => tp.excludedMembers.includes(m.id));
                                            
                                            return (
                                              <div key={tp.teamId} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                                {/* 团队头部 */}
                                                <div className="flex items-center justify-between p-3 bg-slate-50">
                                                  <div className="flex items-center gap-2">
                                                    <button
                                                      onClick={() => setExpandedTeamId(isExpanded ? null : tp.teamId)}
                                                      className="text-slate-600 hover:text-slate-800 transition-colors"
                                                    >
                                                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                    </button>
                                                    <Users className="w-4 h-4 text-blue-600" />
                                                    <span className="text-sm font-medium text-slate-700">{tp.teamName}</span>
                                                    <span className="text-xs text-slate-500">({filteredMembers.length}人)</span>
                                                  </div>
                                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                                    tp.permission === 'view' ? 'bg-blue-100 text-blue-700' :
                                                    tp.permission === 'edit' ? 'bg-green-100 text-green-700' :
                                                    'bg-purple-100 text-purple-700'
                                                  }`}>
                                                    {tp.permission === 'view' ? '可查看' : tp.permission === 'edit' ? '可编辑' : '可管理'}
                                                  </span>
                                                </div>

                                                {/* 成员列表（折叠状态） */}
                                                {!isExpanded && (
                                                  <div className="p-3 space-y-2">
                                                    {/* 权限统计 */}
                                                    <div className="flex items-center gap-3 text-xs">
                                                      <div className="flex items-center gap-1">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                        <span className="text-slate-600">
                                                          可查看: {filteredMembers.filter(m => tp.memberPermissions[m.id] === 'view').length}人
                                                        </span>
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                        <span className="text-slate-600">
                                                          可编辑: {filteredMembers.filter(m => tp.memberPermissions[m.id] === 'edit').length}人
                                                        </span>
                                                      </div>
                                                    </div>
                                                    
                                                    {/* 前5个成员 */}
                                                    <div className="space-y-1">
                                                      {filteredMembers.slice(0, 5).map(member => {
                                                        const permission = tp.memberPermissions[member.id] || 'view';
                                                        return (
                                                          <div
                                                            key={member.id}
                                                            className="flex items-center justify-between p-1.5 bg-slate-50 rounded hover:bg-blue-50 transition-colors"
                                                          >
                                                            <div className="flex items-center gap-2">
                                                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                                                                permission === 'edit' ? 'bg-gradient-to-br from-green-400 to-green-600' :
                                                                permission === 'manage' ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
                                                                'bg-gradient-to-br from-blue-400 to-blue-600'
                                                              }`}>
                                                                {member.name.charAt(0)}
                                                              </div>
                                                              <span className="text-xs text-slate-700">{member.name}</span>
                                                            </div>
                                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                                              permission === 'edit' ? 'bg-green-100 text-green-700' :
                                                              permission === 'manage' ? 'bg-purple-100 text-purple-700' :
                                                              'bg-blue-100 text-blue-700'
                                                            }`}>
                                                              {permission === 'edit' ? '可编辑' : permission === 'manage' ? '可管理' : '可查看'}
                                                            </span>
                                                          </div>
                                                        );
                                                      })}
                                                      {filteredMembers.length > 5 && (
                                                        <button
                                                          onClick={() => setExpandedTeamId(tp.teamId)}
                                                          className="w-full text-xs text-blue-600 hover:text-blue-700 text-center py-2 hover:bg-blue-50 rounded transition-colors"
                                                        >
                                                          还有 {filteredMembers.length - 5} 人，点击查看全部
                                                        </button>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}

                                                {/* 成员列表（展开状态） */}
                                                {isExpanded && (
                                                  <div className="p-3 space-y-2">
                                                    {/* 活跃成员 */}
                                                    <div className="space-y-1">
                                                      {filteredMembers.map(member => (
                                                        <div
                                                          key={member.id}
                                                          className="flex items-center justify-between p-2 bg-slate-50 rounded hover:bg-blue-50 transition-colors"
                                                        >
                                                          <div className="flex items-center gap-2 flex-1">
                                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                                                              {member.name.charAt(0)}
                                                            </div>
                                                            <span className="text-xs text-slate-700">{member.name}</span>
                                                          </div>
                                                          <div className="flex items-center gap-2">
                                                            {/* 权限选择按钮组 */}
                                                            <div className="flex gap-1 bg-white rounded-lg p-0.5 border border-slate-200">
                                                              <button
                                                                onClick={() => {
                                                                  const newPermissions = [...teamPermissions];
                                                                  const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                                  newPermissions[index].memberPermissions[member.id] = 'view';
                                                                  setTeamPermissions(newPermissions);
                                                                }}
                                                                className={`px-2 py-1 text-xs rounded transition-all ${
                                                                  (tp.memberPermissions[member.id] || 'view') === 'view'
                                                                    ? 'bg-blue-500 text-white shadow-sm'
                                                                    : 'text-slate-600 hover:text-slate-800'
                                                                }`}
                                                              >
                                                                可查看
                                                              </button>
                                                              <button
                                                                onClick={() => {
                                                                  const newPermissions = [...teamPermissions];
                                                                  const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                                  newPermissions[index].memberPermissions[member.id] = 'edit';
                                                                  setTeamPermissions(newPermissions);
                                                                }}
                                                                className={`px-2 py-1 text-xs rounded transition-all ${
                                                                  tp.memberPermissions[member.id] === 'edit'
                                                                    ? 'bg-green-500 text-white shadow-sm'
                                                                    : 'text-slate-600 hover:text-slate-800'
                                                                }`}
                                                              >
                                                                可编辑
                                                              </button>
                                                              <button
                                                                onClick={() => {
                                                                  const newPermissions = [...teamPermissions];
                                                                  const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                                  newPermissions[index].memberPermissions[member.id] = 'manage';
                                                                  setTeamPermissions(newPermissions);
                                                                }}
                                                                className={`px-2 py-1 text-xs rounded transition-all ${
                                                                  tp.memberPermissions[member.id] === 'manage'
                                                                    ? 'bg-purple-500 text-white shadow-sm'
                                                                    : 'text-slate-600 hover:text-slate-800'
                                                                }`}
                                                              >
                                                                可管理
                                                              </button>
                                                            </div>
                                                            <button
                                                              onClick={() => {
                                                                const newPermissions = [...teamPermissions];
                                                                const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                                newPermissions[index].excludedMembers.push(member.id);
                                                                setTeamPermissions(newPermissions);
                                                              }}
                                                              className="text-xs text-slate-400 hover:text-red-600 transition-colors px-2"
                                                            >
                                                              排除
                                                            </button>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>

                                                    {/* 已排除成员 */}
                                                    {excludedMembersList.length > 0 && (
                                                      <div className="mt-3 pt-3 border-t border-slate-200">
                                                        <div className="text-xs text-slate-500 mb-2">已排除成员 ({excludedMembersList.length})</div>
                                                        <div className="space-y-1">
                                                          {excludedMembersList.map(member => (
                                                            <div
                                                              key={member.id}
                                                              className="flex items-center justify-between p-2 bg-red-50 rounded"
                                                            >
                                                              <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 text-xs font-medium">
                                                                  {member.name.charAt(0)}
                                                                </div>
                                                                <span className="text-xs text-slate-600 line-through">{member.name}</span>
                                                              </div>
                                                              <button
                                                                onClick={() => {
                                                                  const newPermissions = [...teamPermissions];
                                                                  const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                                  newPermissions[index].excludedMembers = newPermissions[index].excludedMembers.filter(id => id !== member.id);
                                                                  setTeamPermissions(newPermissions);
                                                                }}
                                                                className="text-xs text-green-600 hover:text-green-700"
                                                              >
                                                                恢复
                                                              </button>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {/* 成员预览 */}
                                      {selectedPermissionTab === 'member' && selectedMembers.length > 0 && (
                                        <div className="bg-white rounded-lg border border-slate-200 p-3">
                                          <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                              <User className="w-4 h-4 text-green-600" />
                                              <span className="text-sm font-medium text-slate-700">已选择成员</span>
                                              <span className="text-xs text-slate-500">({selectedMembers.length}人)</span>
                                            </div>
                                          </div>
                                          
                                          {/* 成员列表 */}
                                          <div className="space-y-2">
                                            {selectedMembers.map(member => (
                                              <div
                                                key={member.id}
                                                className="flex items-center justify-between p-2 bg-slate-50 rounded hover:bg-blue-50 transition-colors"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                                                    member.permission === 'edit' ? 'bg-gradient-to-br from-green-400 to-green-600' :
                                                    member.permission === 'manage' ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
                                                    'bg-gradient-to-br from-blue-400 to-blue-600'
                                                  }`}>
                                                    {member.name.charAt(0)}
                                                  </div>
                                                  <span className="text-sm text-slate-700">{member.name}</span>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded ${
                                                  member.permission === 'edit' ? 'bg-green-100 text-green-700' :
                                                  member.permission === 'manage' ? 'bg-purple-100 text-purple-700' :
                                                  'bg-blue-100 text-blue-700'
                                                }`}>
                                                  {member.permission === 'edit' ? '可编辑' : member.permission === 'manage' ? '可管理' : '可查看'}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-center py-12 text-slate-400">
                                      <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                      <p className="text-sm">选择团队或成员后<br/>这里将显示权限信息</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 公开知识库提示 */}
                          {newKBConfig.permissionType === 'public' && (
                            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
                              <p className="text-sm text-blue-700 flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                <span>此知识库对所有企业成员公开，任何人都可以访问和使用其中的内容。</span>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 步骤二：检索配置 */}
                {newKBStep === 2 && (
                  <div className="space-y-6">
                    {/* 一、检索方案 */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
                        检索方案
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { 
                            value: '混合检索', 
                            label: '推荐检索', 
                            desc: '适合大多数企业知识库，兼顾关键词匹配和语义理解', 
                            recommended: true 
                          },
                          { 
                            value: '向量检索', 
                            label: '智能问答', 
                            desc: '适合员工手册、产品资料、FAQ、制度文档等自然语言问答场景' 
                          },
                          { 
                            value: '全文检索', 
                            label: '精准检索', 
                            desc: '适合制度编号、合同条款、产品型号、客户名称等精确关键词查询' 
                          }
                        ].map((method) => (
                          <button
                            key={method.value}
                            onClick={() => setNewKBConfig({...newKBConfig, retrievalMethod: method.value})}
                            className={`relative p-6 rounded-xl border-2 transition-all text-left h-full ${
                              newKBConfig.retrievalMethod === method.value
                                ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-500/20'
                                : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                            }`}
                          >
                            {method.recommended && (
                              <span className="absolute top-3 right-3 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                                推荐
                              </span>
                            )}
                            <div className="font-semibold text-slate-800 mb-2">{method.label}</div>
                            <div className="text-xs text-slate-500 leading-relaxed">{method.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 二、检索偏好 */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
                        检索偏好
                      </h3>
                      <p className="text-sm text-slate-600 mb-6">系统会根据检索偏好自动调整召回数量、匹配阈值和结果覆盖范围</p>
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { 
                            value: 'precise' as const, 
                            label: '精准优先', 
                            desc: '优先返回高匹配内容，减少无关结果，适合制度条款、合同编号、产品型号等场景',
                            params: { topK: 3, threshold: 0.75, maxRecall: 8 }
                          },
                          { 
                            value: 'balanced' as const, 
                            label: '平衡推荐', 
                            desc: '兼顾准确性和覆盖范围，适合大多数企业知识库', 
                            recommended: true,
                            params: { topK: 5, threshold: 0.7, maxRecall: 10 }
                          },
                          { 
                            value: 'recall' as const, 
                            label: '召回优先', 
                            desc: '召回更多相关资料，减少遗漏，适合资料量大、问题较宽泛的知识库',
                            params: { topK: 8, threshold: 0.6, maxRecall: 15 }
                          }
                        ].map((pref) => (
                          <button
                            key={pref.value}
                            onClick={() => {
                              setRetrievalPreference(pref.value);
                              setNewKBConfig({
                                ...newKBConfig,
                                topK: pref.params.topK,
                                similarityThreshold: pref.params.threshold,
                                maxRecall: pref.params.maxRecall
                              });
                            }}
                            className={`relative p-6 rounded-xl border-2 transition-all text-left h-full ${
                              retrievalPreference === pref.value
                                ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-500/20'
                                : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                            }`}
                          >
                            {pref.recommended && (
                              <span className="absolute top-3 right-3 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                                推荐
                              </span>
                            )}
                            <div className="font-semibold text-slate-800 mb-2">{pref.label}</div>
                            <div className="text-xs text-slate-500 leading-relaxed">{pref.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 提示信息 */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-sm text-blue-700">
                        💡 系统会根据当前选择自动配置检索模型与参数，创建后可在知识库设置中继续调整
                      </p>
                    </div>

                    {/* 三、高级配置 */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                      <button
                        onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                        className="w-full p-6 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-2xl"
                      >
                        <div className="text-left">
                          <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                            <span className="w-1 h-6 bg-slate-400 rounded-full"></span>
                            高级配置
                          </h3>
                          <p className="text-xs text-slate-500">
                            系统将根据所选检索方案和检索偏好自动配置模型与参数，通常无需修改。仅建议管理员或了解检索参数的用户调整
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-blue-600 font-medium">
                            {showAdvancedConfig ? '收起配置' : '展开高级配置'}
                          </span>
                          {showAdvancedConfig ? (
                            <ChevronUp className="w-4 h-4 text-blue-600" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                      </button>

                      {showAdvancedConfig && (
                        <div className="px-6 pb-6 space-y-6 border-t border-slate-200">
                          <div className="max-w-[640px] mx-auto space-y-6 pt-6">
                            {/* A. 模型参数 */}
                            {newKBConfig.retrievalMethod !== '全文检索' && (
                              <div className="space-y-4">
                                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                  <span className="w-1 h-4 bg-slate-400 rounded-full"></span>
                                  模型参数
                                </h4>
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">向量模型</label>
                                    <select
                                      value={newKBConfig.vectorModel}
                                      onChange={(e) => setNewKBConfig({...newKBConfig, vectorModel: e.target.value})}
                                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                      <option value="text-embedding-3-large">text-embedding-3-large (推荐)</option>
                                      <option value="text-embedding-3-small">text-embedding-3-small</option>
                                      <option value="text-embedding-ada-002">text-embedding-ada-002</option>
                                    </select>
                                  </div>
                                  {newKBConfig.retrievalMethod === '混合检索' && (
                                    <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-2">
                                        重排序模型 {newKBConfig.retrievalMethod === '向量检索' && <span className="text-xs text-slate-500">(可选)</span>}
                                      </label>
                                      <select
                                        value={newKBConfig.rerankModel}
                                        onChange={(e) => setNewKBConfig({...newKBConfig, rerankModel: e.target.value})}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                      >
                                        <option value="bge-reranker-v2-m3">bge-reranker-v2-m3 (推荐)</option>
                                        <option value="bge-reranker-base">bge-reranker-base</option>
                                        <option value="bge-reranker-large">bge-reranker-large</option>
                                      </select>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* B. 检索参数 */}
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <span className="w-1 h-4 bg-slate-400 rounded-full"></span>
                                检索参数
                              </h4>
                              <div className="space-y-4">
                                {newKBConfig.retrievalMethod !== '全文检索' && (
                                  <>
                                    <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-2">Top K</label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="20"
                                        value={newKBConfig.topK}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 1;
                                          setNewKBConfig({...newKBConfig, topK: Math.min(20, Math.max(1, val))});
                                        }}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                      />
                                      <p className="text-xs text-slate-500 mt-1">召回更多内容会提升覆盖率，但可能降低准确率（范围：1-20）</p>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-2">相似度阈值</label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={newKBConfig.similarityThreshold}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setNewKBConfig({...newKBConfig, similarityThreshold: Math.min(1, Math.max(0, val))});
                                        }}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                      />
                                      <p className="text-xs text-slate-500 mt-1">值越高，过滤越严格（范围：0-1）</p>
                                    </div>
                                  </>
                                )}
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-2">
                                    {newKBConfig.retrievalMethod === '全文检索' ? '最大返回数量' : '最大召回数量'}
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={newKBConfig.maxRecall}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 1;
                                      setNewKBConfig({...newKBConfig, maxRecall: Math.min(50, Math.max(1, val))});
                                    }}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  />
                                  <p className="text-xs text-slate-500 mt-1">最终返回文档数量的上限（范围：1-50）</p>
                                </div>
                                {newKBConfig.retrievalMethod === '全文检索' && (
                                  <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">是否启用同义词扩展</label>
                                    <select
                                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                      <option value="false">否</option>
                                      <option value="true">是</option>
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">启用后会自动匹配同义词，提升召回率</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* C. 文件解析策略 */}
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <span className="w-1 h-4 bg-slate-400 rounded-full"></span>
                                文件解析策略
                              </h4>
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-2">默认切片策略</label>
                                  <select
                                    value={newKBConfig.defaultChunkStrategy}
                                    onChange={(e) => setNewKBConfig({...newKBConfig, defaultChunkStrategy: e.target.value})}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  >
                                    <option value="smart">智能切片（推荐）</option>
                                    <option value="fixed">固定长度</option>
                                    <option value="paragraph">按段落</option>
                                  </select>
                                  <p className="text-xs text-slate-500 mt-1">
                                    {newKBConfig.defaultChunkStrategy === 'smart' && '自动识别文档结构（标题、段落、列表等），智能切分保持语义完整性'}
                                    {newKBConfig.defaultChunkStrategy === 'fixed' && '按固定字符数切分文档，适合结构化程度较低的文本'}
                                    {newKBConfig.defaultChunkStrategy === 'paragraph' && '按自然段落切分，保持段落完整性，适合结构清晰的文档'}
                                  </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">默认切片大小</label>
                                    <input
                                      type="number"
                                      value={newKBConfig.defaultChunkSize}
                                      onChange={(e) => setNewKBConfig({...newKBConfig, defaultChunkSize: parseInt(e.target.value) || 800})}
                                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                      placeholder="800"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">单个文本块的最大字符数</p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">默认重叠长度</label>
                                    <input
                                      type="number"
                                      value={newKBConfig.defaultOverlap}
                                      onChange={(e) => setNewKBConfig({...newKBConfig, defaultOverlap: parseInt(e.target.value) || 100})}
                                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                      placeholder="100"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">相邻块之间的重叠字符数</p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 恢复默认配置按钮 */}
                            <div className="pt-4 border-t border-slate-200">
                              <button
                                onClick={() => {
                                  setRetrievalPreference('balanced');
                                  setNewKBConfig({
                                    ...newKBConfig,
                                    retrievalMethod: '混合检索',
                                    vectorModel: 'text-embedding-3-large',
                                    rerankModel: 'bge-reranker-v2-m3',
                                    topK: 5,
                                    similarityThreshold: 0.7,
                                    maxRecall: 10,
                                    defaultChunkStrategy: 'smart',
                                    defaultChunkSize: 800,
                                    defaultOverlap: 100
                                  });
                                }}
                                className="px-4 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                恢复默认配置
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* 步骤三：确认创建 */}
                {newKBStep === 3 && (
                  <div className="space-y-6">
                    {/* 权限设置 */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
                        确认创建
                      </h3>
                      <div className="space-y-6">
                        {/* 权限类型选择 */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-3">访问权限类型</label>
                          <div className="grid grid-cols-2 gap-4">
                            {[
                              { 
                                value: 'public', 
                                label: '公开知识库', 
                                icon: '🌐',
                                desc: '所有人都可以访问和使用' 
                              },
                              { 
                                value: 'private', 
                                label: '私有知识库', 
                                icon: '🔒',
                                desc: '仅指定人员可以访问，支持精细化权限控制' 
                              }
                            ].map((type) => (
                              <button
                                key={type.value}
                                onClick={() => setNewKBConfig({...newKBConfig, permissionType: type.value as 'public' | 'private'})}
                                className={`relative p-5 rounded-xl border-2 transition-all text-left ${
                                  newKBConfig.permissionType === type.value
                                    ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-500/20'
                                    : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                                }`}
                              >
                                <div className="text-2xl mb-2">{type.icon}</div>
                                <div className="font-semibold text-slate-800 mb-1">{type.label}</div>
                                <div className="text-xs text-slate-500 leading-relaxed">{type.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 私有知识库权限配置 - 团队+角色双维度 */}
                        {newKBConfig.permissionType === 'private' && (
                          <div className="space-y-6">
                            {/* 权限配置主体 - 左右分栏 */}
                            <div className="grid grid-cols-2 gap-6">
                              {/* 左侧：选择团队/角色 */}
                              <div className="space-y-4">
                                {/* 标签切换 */}
                                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                                  <button
                                    onClick={() => setSelectedPermissionTab('team')}
                                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                      selectedPermissionTab === 'team'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center justify-center gap-2">
                                      <Users className="w-4 h-4" />
                                      团队权限
                                    </div>
                                  </button>
                                  <button
                                    onClick={() => setSelectedPermissionTab('member')}
                                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                      selectedPermissionTab === 'member'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center justify-center gap-2">
                                      <User className="w-4 h-4" />
                                      成员权限
                                    </div>
                                  </button>
                                </div>

                                {/* 管理入口提示 */}
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3">
                                  <div className="flex items-start gap-2">
                                    <div className="text-blue-600 mt-0.5">
                                      <Settings className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-xs text-blue-700 mb-2">
                                        {selectedPermissionTab === 'team' ? '没有找到需要的团队？' : '没有找到需要的成员？'}
                                      </p>
                                      <button
                                        onClick={() => {
                                          if (selectedPermissionTab === 'team') {
                                            setShowManageTeamModal(true);
                                          } else {
                                            setShowManageMemberModal(true);
                                          }
                                        }}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:gap-2 transition-all"
                                      >
                                        <Plus className="w-3 h-3" />
                                        {selectedPermissionTab === 'team' ? '管理团队' : '管理成员'}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* 团队选择 */}
                                {selectedPermissionTab === 'team' && (
                                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                                    {/* 搜索框 */}
                                    <div className="mb-4">
                                      <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                          type="text"
                                          placeholder="搜索团队..."
                                          value={collaboratorSearchQuery}
                                          onChange={(e) => setCollaboratorSearchQuery(e.target.value)}
                                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                      </div>
                                    </div>

                                    {/* 已添加的团队 */}
                                    {teamPermissions.length > 0 && (
                                      <div className="mb-4">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">已添加的团队</h3>
                                        <div className="space-y-2">
                                          {teamPermissions.map((tp, index) => (
                                            <div key={tp.teamId} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                                              <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                                                  <Users className="w-4 h-4" />
                                                </div>
                                                <div>
                                                  <div className="text-sm font-medium text-slate-800">{tp.teamName}</div>
                                                  <div className="text-xs text-slate-500">{tp.memberCount}人</div>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <select
                                                  value={tp.permission}
                                                  onChange={(e) => {
                                                    const newPermission = e.target.value as 'view' | 'edit' | 'manage';
                                                    const newPermissions = [...teamPermissions];
                                                    newPermissions[index].permission = newPermission;
                                                    // 同步更新所有成员的权限
                                                    const updatedMemberPermissions: Record<string, 'view' | 'edit' | 'manage'> = {};
                                                    tp.members.forEach(member => {
                                                      updatedMemberPermissions[member.id] = newPermission;
                                                    });
                                                    newPermissions[index].memberPermissions = updatedMemberPermissions;
                                                    setTeamPermissions(newPermissions);
                                                  }}
                                                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                >
                                                  <option value="view">可查看</option>
                                                  <option value="edit">可编辑</option>
                                                  <option value="manage">可管理</option>
                                                </select>
                                                <button
                                                  onClick={() => {
                                                    setTeamPermissions(teamPermissions.filter((_, i) => i !== index));
                                                  }}
                                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                  <X className="w-4 h-4" />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* 可添加的团队列表 */}
                                    <div>
                                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">可添加的团队</h3>
                                      <div className="space-y-1 max-h-[300px] overflow-y-auto">
                                        {mockTeams
                                          .filter(team => 
                                            !teamPermissions.find(tp => tp.teamId === team.id) &&
                                            (collaboratorSearchQuery === '' || team.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()))
                                          )
                                          .map(team => (
                                            <div
                                              key={team.id}
                                              onClick={() => {
                                                const memberPerms: Record<string, 'view' | 'edit'> = {};
                                                team.members.forEach(member => {
                                                  memberPerms[member.id] = 'view';
                                                });
                                                
                                                setTeamPermissions([...teamPermissions, {
                                                  teamId: team.id,
                                                  teamName: team.name,
                                                  memberCount: team.memberCount,
                                                  permission: 'view',
                                                  members: team.members,
                                                  excludedMembers: [],
                                                  memberPermissions: memberPerms
                                                }]);
                                              }}
                                              className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group"
                                            >
                                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-sm font-medium">
                                                <Users className="w-4 h-4" />
                                              </div>
                                              <div className="flex-1">
                                                <div className="text-sm font-medium text-slate-800">{team.name}</div>
                                                <div className="text-xs text-slate-500">{team.memberCount}人</div>
                                              </div>
                                              <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                                            </div>
                                          ))}
                                        {mockTeams.filter(team => 
                                          !teamPermissions.find(tp => tp.teamId === team.id) &&
                                          (collaboratorSearchQuery === '' || team.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()))
                                        ).length === 0 && (
                                          <div className="text-center py-8 text-slate-400">
                                            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">没有找到团队</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* 成员选择 */}
                                {selectedPermissionTab === 'member' && (
                                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                                    {/* 搜索框 */}
                                    <div className="mb-4">
                                      <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                          type="text"
                                          placeholder="搜索成员..."
                                          value={collaboratorSearchQuery}
                                          onChange={(e) => setCollaboratorSearchQuery(e.target.value)}
                                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                      </div>
                                    </div>

                                    {/* 已添加的成员 */}
                                    {selectedMembers.length > 0 && (
                                      <div className="mb-4">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">已添加的成员</h3>
                                        <div className="space-y-2">
                                          {selectedMembers.map((member, index) => (
                                            <div key={member.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                                              <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                                                  member.permission === 'edit'
                                                    ? 'bg-gradient-to-br from-green-400 to-green-600'
                                                    : 'bg-gradient-to-br from-blue-400 to-blue-600'
                                                }`}>
                                                  {member.name.charAt(0)}
                                                </div>
                                                <div>
                                                  <div className="text-sm font-medium text-slate-800">{member.name}</div>
                                                  <div className="text-xs text-slate-500">{member.id}</div>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <select
                                                  value={member.permission}
                                                  onChange={(e) => {
                                                    const newMembers = [...selectedMembers];
                                                    newMembers[index].permission = e.target.value as 'view' | 'edit' | 'manage';
                                                    setSelectedMembers(newMembers);
                                                  }}
                                                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                >
                                                  <option value="view">可查看</option>
                                                  <option value="edit">可编辑</option>
                                                  <option value="manage">可管理</option>
                                                </select>
                                                <button
                                                  onClick={() => {
                                                    setSelectedMembers(selectedMembers.filter((_, i) => i !== index));
                                                  }}
                                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                  <X className="w-4 h-4" />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* 可添加的成员列表 */}
                                    <div>
                                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">可添加的成员</h3>
                                      <div className="space-y-1 max-h-[300px] overflow-y-auto">
                                        {allMembers
                                          .filter(member => 
                                            !selectedMembers.find(m => m.id === member.id) &&
                                            (collaboratorSearchQuery === '' || member.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()))
                                          )
                                          .map(member => (
                                            <div
                                              key={member.id}
                                              onClick={() => {
                                                setSelectedMembers([...selectedMembers, {
                                                  id: member.id,
                                                  name: member.name,
                                                  permission: 'view'
                                                }]);
                                              }}
                                              className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group"
                                            >
                                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-sm font-medium">
                                                {member.name.charAt(0)}
                                              </div>
                                              <div className="flex-1">
                                                <div className="text-sm font-medium text-slate-800">{member.name}</div>
                                                <div className="text-xs text-slate-500">{member.id}</div>
                                              </div>
                                              <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                                            </div>
                                          ))}
                                        {allMembers.filter(member => 
                                          !selectedMembers.find(m => m.id === member.id) &&
                                          (collaboratorSearchQuery === '' || member.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()))
                                        ).length === 0 && (
                                          <div className="text-center py-8 text-slate-400">
                                            <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">没有找到成员</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 右侧：成员预览与管理 */}
                              <div className="bg-white rounded-xl border border-slate-200 p-4 max-h-[600px] overflow-y-auto">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                    <Eye className="w-4 h-4" />
                                    成员预览与管理
                                  </h4>
                                  {/* 搜索框 - 始终显示 */}
                                  <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                      type="text"
                                      placeholder={selectedPermissionTab === 'team' ? '搜索团队或成员...' : '搜索成员...'}
                                      value={memberSearchQuery}
                                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-40"
                                    />
                                  </div>
                                </div>
                                
                                {/* 团队成员预览 */}
                                {selectedPermissionTab === 'team' && teamPermissions.length > 0 && (
                                  <div className="space-y-3">
                                    {teamPermissions
                                      .filter(tp => 
                                        memberSearchQuery === '' || 
                                        tp.teamName.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                                        tp.members.some(m => m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                                      )
                                      .map(tp => {
                                      const isExpanded = expandedTeamId === tp.teamId;
                                      const filteredMembers = tp.members.filter(m => 
                                        !tp.excludedMembers.includes(m.id) &&
                                        (memberSearchQuery === '' || m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                                      );
                                      const excludedMembersList = tp.members.filter(m => tp.excludedMembers.includes(m.id));
                                      
                                      return (
                                        <div key={tp.teamId} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                                          {/* 团队头部 */}
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => setExpandedTeamId(isExpanded ? null : tp.teamId)}
                                                className="text-slate-600 hover:text-slate-800 transition-colors"
                                              >
                                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                              </button>
                                              <span className="text-xs font-medium text-slate-700">{tp.teamName}</span>
                                              <span className="text-xs text-slate-500">({filteredMembers.length}人)</span>
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                              tp.permission === 'view' ? 'bg-blue-100 text-blue-700' :
                                              tp.permission === 'edit' ? 'bg-green-100 text-green-700' :
                                              tp.permission === 'manage' ? 'bg-purple-100 text-purple-700' :
                                              'bg-slate-100 text-slate-700'
                                            }`}>
                                              {tp.permission === 'view' ? '可查看' : 
                                               tp.permission === 'edit' ? '可编辑' : 
                                               tp.permission === 'manage' ? '可管理' : '未知'}
                                            </span>
                                          </div>

                                          {/* 成员列表预览（折叠状态）- 直接显示成员全称 */}
                                          {!isExpanded && (
                                            <div className="space-y-2">
                                              {/* 权限统计 */}
                                              <div className="flex items-center gap-3 text-xs">
                                                <div className="flex items-center gap-1">
                                                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                  <span className="text-slate-600">
                                                    可查看: {filteredMembers.filter(m => tp.memberPermissions[m.id] === 'view').length}人
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                  <span className="text-slate-600">
                                                    可编辑: {filteredMembers.filter(m => tp.memberPermissions[m.id] === 'edit').length}人
                                                  </span>
                                                </div>
                                              </div>
                                              
                                              {/* 成员列表 - 显示前5个成员 */}
                                              <div className="space-y-1">
                                                {filteredMembers.slice(0, 5).map(member => {
                                                  const permission = tp.memberPermissions[member.id] || 'view';
                                                  return (
                                                    <div
                                                      key={member.id}
                                                      className="flex items-center justify-between p-1.5 bg-white rounded hover:bg-blue-50 transition-colors"
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                                                          permission === 'edit'
                                                            ? 'bg-gradient-to-br from-green-400 to-green-600'
                                                            : 'bg-gradient-to-br from-blue-400 to-blue-600'
                                                        }`}>
                                                          {member.name.charAt(0)}
                                                        </div>
                                                        <span className="text-xs text-slate-700">{member.name}</span>
                                                      </div>
                                                      <span className={`text-xs px-2 py-0.5 rounded ${
                                                        permission === 'edit' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                                      }`}>
                                                        {permission === 'edit' ? '可编辑' : '可查看'}
                                                      </span>
                                                    </div>
                                                  );
                                                })}
                                                {filteredMembers.length > 5 && (
                                                  <button
                                                    onClick={() => setExpandedTeamId(tp.teamId)}
                                                    className="w-full text-xs text-blue-600 hover:text-blue-700 text-center py-2 hover:bg-blue-50 rounded transition-colors"
                                                  >
                                                    还有 {filteredMembers.length - 5} 人，点击查看全部
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          )}

                                          {/* 成员列表（展开状态） */}
                                          {isExpanded && (
                                            <div className="space-y-2 mt-2">
                                              {/* 活跃成员 */}
                                              <div className="space-y-1">
                                                {filteredMembers.map(member => (
                                                  <div
                                                    key={member.id}
                                                    className="flex items-center justify-between p-2 bg-white rounded hover:bg-blue-50 transition-colors"
                                                  >
                                                    <div className="flex items-center gap-2 flex-1">
                                                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium">
                                                        {member.name.charAt(0)}
                                                      </div>
                                                      <span className="text-xs text-slate-700">{member.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                      {/* 权限选择按钮组 - 更明显 */}
                                                      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                                                        <button
                                                          onClick={() => {
                                                            const newPermissions = [...teamPermissions];
                                                            const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                            newPermissions[index].memberPermissions[member.id] = 'view';
                                                            setTeamPermissions(newPermissions);
                                                          }}
                                                          className={`px-2 py-1 text-xs rounded transition-all ${
                                                            (tp.memberPermissions[member.id] || 'view') === 'view'
                                                              ? 'bg-blue-500 text-white shadow-sm'
                                                              : 'text-slate-600 hover:text-slate-800'
                                                          }`}
                                                        >
                                                          可查看
                                                        </button>
                                                        <button
                                                          onClick={() => {
                                                            const newPermissions = [...teamPermissions];
                                                            const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                            newPermissions[index].memberPermissions[member.id] = 'edit';
                                                            setTeamPermissions(newPermissions);
                                                          }}
                                                          className={`px-2 py-1 text-xs rounded transition-all ${
                                                            tp.memberPermissions[member.id] === 'edit'
                                                              ? 'bg-green-500 text-white shadow-sm'
                                                              : 'text-slate-600 hover:text-slate-800'
                                                          }`}
                                                        >
                                                          可编辑
                                                        </button>
                                                        <button
                                                          onClick={() => {
                                                            const newPermissions = [...teamPermissions];
                                                            const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                            newPermissions[index].memberPermissions[member.id] = 'manage';
                                                            setTeamPermissions(newPermissions);
                                                          }}
                                                          className={`px-2 py-1 text-xs rounded transition-all ${
                                                            tp.memberPermissions[member.id] === 'manage'
                                                              ? 'bg-purple-500 text-white shadow-sm'
                                                              : 'text-slate-600 hover:text-slate-800'
                                                          }`}
                                                        >
                                                          可管理
                                                        </button>
                                                      </div>
                                                      <button
                                                        onClick={() => {
                                                          const newPermissions = [...teamPermissions];
                                                          const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                          newPermissions[index].excludedMembers.push(member.id);
                                                          setTeamPermissions(newPermissions);
                                                        }}
                                                        className="text-xs text-slate-400 hover:text-red-600 transition-colors px-2"
                                                      >
                                                        排除
                                                      </button>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>

                                              {/* 已排除成员 */}
                                              {excludedMembersList.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-slate-200">
                                                  <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                                                    <span>已排除成员 ({excludedMembersList.length})</span>
                                                  </div>
                                                  <div className="space-y-1">
                                                    {excludedMembersList.map(member => (
                                                      <div
                                                        key={member.id}
                                                        className="flex items-center justify-between p-2 bg-red-50 rounded group"
                                                      >
                                                        <div className="flex items-center gap-2">
                                                          <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 text-xs font-medium">
                                                            {member.name.charAt(0)}
                                                          </div>
                                                          <span className="text-xs text-slate-600 line-through">{member.name}</span>
                                                        </div>
                                                        <button
                                                          onClick={() => {
                                                            const newPermissions = [...teamPermissions];
                                                            const index = newPermissions.findIndex(p => p.teamId === tp.teamId);
                                                            newPermissions[index].excludedMembers = newPermissions[index].excludedMembers.filter(id => id !== member.id);
                                                            setTeamPermissions(newPermissions);
                                                          }}
                                                          className="text-xs text-green-600 hover:text-green-700"
                                                        >
                                                          恢复
                                                        </button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* 成员预览 */}
                                {selectedPermissionTab === 'member' && selectedMembers.length > 0 && (
                                  <div className="space-y-3">
                                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                          <User className="w-4 h-4 text-blue-600" />
                                          <span className="text-sm font-medium text-slate-700">已选择成员</span>
                                          <span className="text-xs text-slate-500">
                                            ({selectedMembers.filter(m => 
                                              memberSearchQuery === '' || 
                                              m.name.toLowerCase().includes(memberSearchQuery.toLowerCase())
                                            ).length}人)
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs">
                                          <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                            <span className="text-slate-600">
                                              可查看: {selectedMembers.filter(m => 
                                                m.permission === 'view' && 
                                                (memberSearchQuery === '' || m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                                              ).length}人
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            <span className="text-slate-600">
                                              可编辑: {selectedMembers.filter(m => 
                                                m.permission === 'edit' && 
                                                (memberSearchQuery === '' || m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                                              ).length}人
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* 成员列表 */}
                                      <div className="space-y-2">
                                        {selectedMembers
                                          .filter(member => 
                                            memberSearchQuery === '' || 
                                            member.name.toLowerCase().includes(memberSearchQuery.toLowerCase())
                                          )
                                          .map(member => (
                                          <div
                                            key={member.id}
                                            className="flex items-center justify-between p-2 bg-white rounded hover:bg-blue-50 transition-colors"
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                                                member.permission === 'edit'
                                                  ? 'bg-gradient-to-br from-green-400 to-green-600'
                                                  : 'bg-gradient-to-br from-blue-400 to-blue-600'
                                              }`}>
                                                {member.name.charAt(0)}
                                              </div>
                                              <span className="text-sm text-slate-700">{member.name}</span>
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded ${
                                              member.permission === 'edit' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                              {member.permission === 'edit' ? '可编辑' : '可查看'}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* 空状态 */}
                                {((selectedPermissionTab === 'team' && teamPermissions.length === 0) ||
                                  (selectedPermissionTab === 'member' && selectedMembers.length === 0)) && (
                                  <div className="text-center py-12 text-slate-400">
                                    <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">选择{selectedPermissionTab === 'team' ? '团队' : '成员'}后，这里将显示成员信息</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 权限汇总 */}
                            {(teamPermissions.length > 0 || selectedMembers.length > 0) && (
                              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
                                <h4 className="text-sm font-medium text-slate-800 mb-3 flex items-center gap-2">
                                  <BarChart3 className="w-4 h-4" />
                                  权限汇总
                                </h4>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                  <div>
                                    <div className="text-2xl font-bold text-blue-600">{teamPermissions.length}</div>
                                    <div className="text-xs text-slate-600 mt-1">团队</div>
                                  </div>
                                  <div>
                                    <div className="text-2xl font-bold text-green-600">{selectedMembers.length}</div>
                                    <div className="text-xs text-slate-600 mt-1">成员</div>
                                  </div>
                                  <div>
                                    <div className="text-2xl font-bold text-purple-600">
                                      {teamPermissions.reduce((sum, tp) => sum + tp.memberCount, 0) + selectedMembers.length}
                                    </div>
                                    <div className="text-xs text-slate-600 mt-1">总成员数</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 公开知识库提示 */}
                        {newKBConfig.permissionType === 'public' && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <p className="text-sm text-blue-700 flex items-center gap-2">
                              <span className="text-lg">🌐</span>
                              <span>此知识库对所有用户公开，任何人都可以访问和使用其中的内容。</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 存储配置 */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
                        存储配置
                      </h3>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">向量库存储方式</label>
                        <select
                          value={newKBConfig.vectorStorage}
                          onChange={(e) => setNewKBConfig({...newKBConfig, vectorStorage: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        >
                          <option value="default">默认存储</option>
                          <option value="milvus">Milvus</option>
                          <option value="pinecone">Pinecone</option>
                          <option value="weaviate">Weaviate</option>
                          <option value="qdrant">Qdrant</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-2">选择向量数据库存储方式</p>
                      </div>
                    </div>

                    {/* 配置预览 */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-8 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span className="text-2xl">✨</span>
                        配置预览
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">知识库名称：</span>
                          <span className="font-medium text-slate-800">{newKBConfig.name || '未设置'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">检索方式：</span>
                          <span className="font-medium text-slate-800">{newKBConfig.retrievalMethod}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">向量模型：</span>
                          <span className="font-medium text-slate-800">{newKBConfig.vectorModel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">访问权限：</span>
                          <span className="font-medium text-slate-800">
                            {newKBConfig.permissionType === 'public' && '公开知识库'}
                            {newKBConfig.permissionType === 'private' && '私有知识库'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">存储方式：</span>
                          <span className="font-medium text-slate-800">{newKBConfig.vectorStorage}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 底部操作按钮 - 固定在底部，考虑侧边栏宽度 */}
            <div className={`fixed bottom-0 right-0 bg-white border-t border-slate-200 px-8 py-4 flex items-center justify-between z-30 shadow-lg transition-all ${
              isSidebarCollapsed ? 'left-20' : 'left-64'
            }`}>
              {newKBStep > 1 ? (
                <button
                  onClick={() => {
                    setNewKBStep(newKBStep - 1);
                  }}
                  className="px-6 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-medium transition-all border border-slate-200"
                >
                  上一步
                </button>
              ) : (
                <div></div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCancelConfirmModal(true)}
                  className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-all"
                >
                  取消
                </button>
                {newKBStep < 3 ? (
                  <button
                    onClick={() => setNewKBStep(newKBStep + 1)}
                    disabled={newKBStep === 1 && (!newKBConfig.name || !newKBConfig.description)}
                    className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
                  >
                    下一步
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      // 设置创建中状态
                      setIsCreatingKB(true);
                      setCreateKBStatus('creating');
                      
                      try {
                        // 模拟创建过程（实际项目中这里会是API调用）
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        
                        // 创建新知识库
                        const newKB: KnowledgeBase = {
                          id: `kb-${Date.now()}`,
                          name: newKBConfig.name,
                          description: newKBConfig.description,
                          type: 'PDF',
                          category: newKBConfig.kbType,
                          permissionType: newKBConfig.permissionType === 'public' ? '公开知识库' : '私有知识库',
                          embeddingModel: newKBConfig.vectorModel,
                          vectorStorage: newKBConfig.vectorStorage,
                          status: 'Ready',
                          docsCount: 0,
                          lastModified: new Date().toLocaleString('zh-CN', { 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          }).replace(/\//g, '-'),
                          creator: '海洋饼干',
                          modifier: '海洋饼干',
                          tags: newKBConfig.tags,
                          isFavorited: false,
                          documentTypes: [],
                          documents: []
                        };
                        
                        // 添加到知识库列表
                        setKnowledgeBases([newKB, ...knowledgeBases]);
                        
                        // 设置成功状态
                        setCreateKBStatus('success');
                        
                        // 显示成功提示
                        showToast('success', '知识库创建成功');
                        
                        // 等待一下让用户看到成功提示
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // 重置状态并返回首页
                        setShowNewKBPage(false);
                        setNewKBStep(1);
                        setIsCreatingKB(false);
                        setCreateKBStatus('idle');
                        setNewKBConfig({
                          icon: '📚',
                          iconUrl: '',
                          name: '',
                          description: '',
                          category: '通用知识库',
                          tags: [],
                          kbType: '通用知识库',
                          retrievalMethod: '混合检索',
                          vectorModel: 'text-embedding-3-large',
                          rerankModel: 'bge-reranker-v2-m3',
                          topK: 5,
                          similarityThreshold: 0.7,
                          maxRecall: 10,
                          defaultChunkStrategy: 'smart',
                          defaultChunkSize: 800,
                          defaultOverlap: 100,
                          isPublic: false,
                          teamMembers: [],
                          vectorStorage: 'default'
                        });
                      } catch (error) {
                        // 设置错误状态
                        setCreateKBStatus('error');
                        setIsCreatingKB(false);
                        
                        // 显示错误提示
                        showToast('error', '知识库创建失败，请重试');
                        
                        // 3秒后重置状态
                        setTimeout(() => {
                          setCreateKBStatus('idle');
                        }, 3000);
                      }
                    }}
                    disabled={isCreatingKB}
                    className={`px-8 py-2.5 rounded-lg font-medium transition-all shadow-lg flex items-center gap-2 ${
                      createKBStatus === 'creating'
                        ? 'bg-blue-400 cursor-not-allowed' 
                        : createKBStatus === 'success'
                        ? 'bg-blue-500 cursor-default shadow-blue-500/30'
                        : createKBStatus === 'error'
                        ? 'bg-red-500 cursor-default shadow-red-500/30'
                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25'
                    } text-white`}
                  >
                    {createKBStatus === 'creating' && (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>创建中...</span>
                      </>
                    )}
                    {createKBStatus === 'success' && (
                      <>
                        <Check className="w-4 h-4" />
                        <span>创建成功</span>
                      </>
                    )}
                    {createKBStatus === 'error' && (
                      <>
                        <X className="w-4 h-4" />
                        <span>创建失败</span>
                      </>
                    )}
                    {createKBStatus === 'idle' && <span>完成创建</span>}
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        ) : selectedKB ? (
          // 知识库详情页
          selectedDocument ? (
            // 文档详情页 - 三栏对照
            <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
              {(() => {
                const isImageDetail = isImageDocument(selectedDocument);
                const isAudioDetail = isAudioDocument(selectedDocument);
                const imageAnalysis = isImageDetail ? getImageAnalysisResult(selectedDocument) : null;
                const imageChunks = imageAnalysis?.chunks || [];
                const activeImageChunk = imageChunks.find(chunk => chunk.id === activeImageChunkId) || imageChunks[0];
                const filteredImageChunks = imageChunks.filter((chunk, index) => {
                  const query = chunkSearchQuery.trim().toLowerCase();
                  if (!query) return true;
                  return [
                    String(index + 1),
                    chunk.title,
                    getImageChunkTypeLabel(chunk.chunkType || chunk.type || ''),
                    chunk.content
                  ].filter(Boolean).some(value => String(value).toLowerCase().includes(query));
                });
                const audioSegments = isAudioDetail ? getAudioTranscriptSegments(selectedDocument) : [];
                const chunkSource = selectedDocument.chunks?.length
                  ? selectedDocument.chunks.map(chunk => chunk.content)
                  : selectedDocument.content?.trim()
                    ? [selectedDocument.content]
                    : [];
                const chunks = chunkSource.map((text, index) => ({
                  id: index + 1,
                  chars: (chunkEdits[index + 1] ?? text).length,
                  type: selectedDocument.sliceRule || '原文切片',
                  text: chunkEdits[index + 1] ?? text,
                  enabled: chunkEnabledMap[index + 1] ?? true
                }));
                const filteredChunks = chunks.filter(chunk => {
                  const matchesStatus =
                    chunkStatusFilter === 'all' ||
                    (chunkStatusFilter === 'enabled' && chunk.enabled) ||
                    (chunkStatusFilter === 'disabled' && !chunk.enabled);
                  const query = chunkSearchQuery.trim().toLowerCase();
                  const matchesSearch =
                    query === '' ||
                    chunk.text.toLowerCase().includes(query) ||
                    chunk.type.toLowerCase().includes(query) ||
                    `#${chunk.id}`.includes(query) ||
                    String(chunk.id).includes(query);
                  return matchesStatus && matchesSearch;
                });
                const activeChunk = chunks.find(chunk => chunk.id === activeDocumentChunkId) || chunks[0];
                const getOriginalChunkClass = (id: number) =>
                  activeChunk.id === id
                    ? 'border-blue-300 bg-blue-50/70 shadow-sm'
                    : 'border-transparent bg-transparent';
                const renderFormattedOriginalBlock = (text: string, index: number) => {
                  const chunkId = index + 1;
                  const lines = text.trim().split(/\r?\n/);
                  const firstLine = lines[0]?.trim() || '';
                  const tableLines = lines.filter(line => /^\s*\|.+\|\s*$/.test(line));
                  if (tableLines.length >= 2) {
                    const rows = tableLines
                      .filter(line => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
                      .map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
                    const [header, ...body] = rows;
                    return (
                      <div data-chunk-id={chunkId} className={`rounded-xl border p-4 transition-all ${getOriginalChunkClass(chunkId)}`}>
                        <div className="mb-3 text-xs font-semibold text-slate-400">表格片段 #{chunkId}</div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            {header && (
                              <thead className="bg-slate-50">
                                <tr>{header.map((cell, cellIndex) => <th key={cellIndex} className="px-3 py-2 text-left font-semibold text-slate-700">{cell}</th>)}</tr>
                              </thead>
                            )}
                            <tbody className="divide-y divide-slate-100">
                              {body.map((row, rowIndex) => (
                                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-slate-600">{cell}</td>)}</tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  }
                  if (/^```/.test(firstLine)) {
                    return (
                      <pre data-chunk-id={chunkId} className={`overflow-x-auto rounded-xl border p-4 text-xs leading-6 text-slate-700 transition-all ${getOriginalChunkClass(chunkId)}`}>
                        {text.replace(/^```[^\n]*\n?|\n?```$/g, '')}
                      </pre>
                    );
                  }
                  const heading = firstLine.match(/^(#{1,6})\s+(.+)/);
                  const pageTitle = firstLine.match(/^---\s*(第\s*\d+\s*页|Slide\s*\d+|第\s*\d+\s*页)\s*---$/i);
                  return (
                    <section data-chunk-id={chunkId} className={`rounded-xl border p-4 transition-all ${getOriginalChunkClass(chunkId)}`}>
                      {pageTitle && <div className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">{pageTitle[1]}</div>}
                      {heading ? (
                        <>
                          <h2 className={`${heading[1].length === 1 ? 'text-xl' : 'text-lg'} font-bold text-slate-950`}>{heading[2]}</h2>
                          <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
                            {lines.slice(1).filter(Boolean).map((line, lineIndex) => {
                              const listItem = line.match(/^\s*[-*]\s+(.+)/) || line.match(/^\s*\d+[.、]\s+(.+)/);
                              return listItem
                                ? <div key={lineIndex} className="flex gap-2"><span className="mt-3 h-1.5 w-1.5 rounded-full bg-blue-400" /><span>{listItem[1]}</span></div>
                                : <p key={lineIndex}>{line}</p>;
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2 text-sm leading-7 text-slate-700">
                          {lines.filter(Boolean).map((line, lineIndex) => {
                            const listItem = line.match(/^\s*[-*]\s+(.+)/) || line.match(/^\s*\d+[.、]\s+(.+)/);
                            return listItem
                              ? <div key={lineIndex} className="flex gap-2"><span className="mt-3 h-1.5 w-1.5 rounded-full bg-blue-400" /><span>{listItem[1]}</span></div>
                              : <p key={lineIndex}>{line}</p>;
                          })}
                        </div>
                      )}
                    </section>
                  );
                };
                const renderUploadedTextContent = () => {
                  const source = selectedDocument.content?.trim() || '';
                  if (!source) {
                    return (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                        暂无可展示的原文内容
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-4">
                      {chunks.map((chunk, index) => renderFormattedOriginalBlock(chunk.text, index))}
                    </div>
                  );
                };
                return (
                  <>
                    {/* 顶部导航栏 */}
                    <div className="h-[78px] bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-5 min-w-0">
                        <button
                          onClick={() => {
                            setSelectedDocument(null);
                            setShowDocumentChunks(false);
                          }}
                          className="p-2 -ml-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-3 min-w-0">
                          {selectedDocument.format.toUpperCase() === 'PDF' ? (
                            <div className="w-7 h-7 bg-red-500 rounded-lg flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-white" />
                            </div>
                          ) : (
                            getFileTypeIcon(selectedDocument.format)
                          )}
                          <h2 className="text-lg font-bold text-slate-900 truncate">{selectedDocument.name}</h2>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => downloadDocument(selectedDocument)}
                          className="h-9 px-4 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-900 text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          下载原文
                        </button>
                        <button
                          onClick={() => setShowDocumentChunks(true)}
                          className={`h-9 px-4 border rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors ${
                            showDocumentChunks
                              ? 'border-blue-200 bg-blue-50 text-blue-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-900'
                          }`}
                        >
                          <FileStack className="w-4 h-4" />
                          查看切片
                        </button>
                        <button
                          onClick={() => {
                            setEditingDoc(selectedDocument);
                            setShowDocConfigModal(true);
                          }}
                          className="h-9 px-4 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-900 text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                          配置详情
                        </button>
                      </div>
                    </div>

                    <div className={`flex-1 grid ${showDocumentChunks ? 'grid-cols-[44%_56%]' : 'grid-cols-1'} overflow-hidden bg-white`}>
                      {/* 原文对照 */}
                      <section className={`${showDocumentChunks ? 'border-r border-slate-200' : ''} flex flex-col overflow-hidden`}>
                        <div className="px-6 pt-6 pb-3 shrink-0">
                          <h3 className="text-lg font-bold text-slate-900">原文</h3>
                        </div>
                        <div className="mx-6 border-t border-slate-200" />
                        <div ref={originalTextScrollRef} className="flex-1 overflow-y-auto px-6 py-7 no-scrollbar">
                          <div className={`${showDocumentChunks ? 'max-w-[520px]' : isAudioDetail ? 'max-w-6xl' : 'max-w-[760px]'} mx-auto text-slate-900 leading-relaxed`}>
                            {isImageDetail ? (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-800">图片类型判断</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {imageAnalysis?.imageType === 'structured'
                                        ? '按标题、字段和值、表格行、编号步骤和版块内容生成切片。'
                                        : '根据可见对象识别和 OCR 生成整图描述；没有结果时保留原图，不补模板文案。'}
                                    </div>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                                    imageAnalysis?.imageType === 'structured'
                                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                                      : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                  }`}>
                                    {imageAnalysis?.imageType === 'structured' ? '结构化图片' : '非结构化图片'}
                                  </span>
                                </div>
                                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                  <div className="relative mx-auto aspect-[4/3] w-full max-w-[760px] bg-white">
                                    {selectedDocument.previewUrl ? (
                                      <img src={selectedDocument.previewUrl} alt={selectedDocument.name} className="h-full w-full object-contain" />
                                    ) : (
                                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-50 to-blue-50 text-slate-400">
                                        <Image className="h-16 w-16" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : isAudioDetail ? (
                              <div className="flex min-h-full flex-col pb-28">
                                <div className="mb-6">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <h1 className="text-2xl font-semibold text-slate-950">{selectedDocument.name.replace(/\.[^.]+$/, '')}</h1>
                                      <div className="mt-2 text-sm text-slate-400">ASR 转写结果 · 点击时间戳文本可定位到对应播放节点</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-700 ring-1 ring-pink-100">音视频 ASR</span>
                                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{audioSegments.length} 个时间片段</span>
                                    </div>
                                  </div>
                                </div>
                                <audio
                                  ref={audioPreviewRef}
                                  src={selectedDocument.previewUrl}
                                  className="hidden"
                                  onLoadedMetadata={(event) => {
                                    const duration = event.currentTarget.duration;
                                    if (Number.isFinite(duration) && duration > 0) setAudioDuration(duration);
                                  }}
                                  onTimeUpdate={(event) => setAudioCurrentTime(event.currentTarget.currentTime)}
                                  onPlay={() => setIsAudioPlaying(true)}
                                  onPause={() => setIsAudioPlaying(false)}
                                  onEnded={() => setIsAudioPlaying(false)}
                                />
                                <div className="space-y-12">
                                  {audioSegments.length > 0 ? (
                                    audioSegments.map((segment, index) => {
                                      const segmentSeconds = getSecondsFromTimestamp(segment.time);
                                      const nextSeconds = audioSegments[index + 1] ? getSecondsFromTimestamp(audioSegments[index + 1].time) : audioDuration;
                                      const isActive = audioCurrentTime >= segmentSeconds && audioCurrentTime < nextSeconds;
                                      return (
                                        <button
                                          key={`${segment.time}-${index}`}
                                          type="button"
                                          onClick={() => {
                                            setActiveDocumentChunkId(index + 1);
                                            setAudioCurrentTime(segmentSeconds);
                                            if (audioPreviewRef.current) {
                                              audioPreviewRef.current.currentTime = segmentSeconds;
                                            }
                                          }}
                                          className={`grid w-full grid-cols-[86px_1fr] gap-6 rounded-2xl px-2 py-1 text-left transition-colors ${
                                            isActive ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                                          }`}
                                        >
                                          <span className={`pt-1 text-2xl font-medium ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>{segment.time}</span>
                                          <span className={`text-xl leading-10 transition-colors ${isActive ? 'text-emerald-700' : index > 2 ? 'text-slate-400' : 'text-slate-900'}`}>
                                            {segment.text}
                                          </span>
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
                                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
                                        <Video className="h-5 w-5" />
                                      </div>
                                      <div className="mt-4 text-base font-semibold text-slate-800">暂未生成转写文本</div>
                                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                                        {selectedDocument.asrMessage || '当前音视频没有识别到清晰语音内容。可以继续播放原文件，或重新上传更清晰、时长更短的音视频后再试。'}
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <div className={`fixed bottom-0 z-30 border-t border-slate-100 bg-white/95 px-10 py-5 shadow-[0_-12px_30px_-26px_rgba(15,23,42,0.45)] backdrop-blur ${
                                  isSidebarCollapsed ? 'left-20' : 'left-64'
                                } right-0`}>
                                  <div className="mx-auto max-w-5xl">
                                    <div className="mb-4 flex items-center justify-center gap-8">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextTime = Math.max(0, audioCurrentTime - 15);
                                          setAudioCurrentTime(nextTime);
                                          if (audioPreviewRef.current) audioPreviewRef.current.currentTime = nextTime;
                                        }}
                                        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
                                      >
                                        <RotateCcw className="h-5 w-5" />
                                        <span className="sr-only">后退 15 秒</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const audio = audioPreviewRef.current;
                                          if (!audio) return;
                                          if (audio.paused) {
                                            void audio.play();
                                          } else {
                                            audio.pause();
                                          }
                                        }}
                                        className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm hover:bg-slate-800"
                                      >
                                        {isAudioPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextTime = Math.min(audioDuration, audioCurrentTime + 15);
                                          setAudioCurrentTime(nextTime);
                                          if (audioPreviewRef.current) audioPreviewRef.current.currentTime = nextTime;
                                        }}
                                        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
                                      >
                                        <RotateCw className="h-5 w-5" />
                                        <span className="sr-only">前进 15 秒</span>
                                      </button>
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={Math.max(audioDuration, 1)}
                                      step={1}
                                      value={Math.min(audioCurrentTime, audioDuration)}
                                      onChange={(event) => {
                                        const nextTime = Number(event.target.value);
                                        setAudioCurrentTime(nextTime);
                                        if (audioPreviewRef.current) audioPreviewRef.current.currentTime = nextTime;
                                      }}
                                      className="w-full accent-slate-400"
                                    />
                                    <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                                      <span>{formatPlaybackTime(audioCurrentTime)}</span>
                                      <span>{formatPlaybackTime(audioDuration)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              renderUploadedTextContent()
                            )}
                          </div>
                        </div>
                      </section>

                      {/* 切片信息 */}
                      {showDocumentChunks && (
                      <section className="flex flex-col overflow-hidden">
                        <div className="px-6 pt-6 pb-0 shrink-0">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                切片信息
                              </h3>
                              <button
                                type="button"
                                onClick={() => setShowDocumentChunks(false)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
                              >
                                <X className="h-3.5 w-3.5" />
                                关闭
                              </button>
                            </div>
                            {!isAudioDetail && (
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  value={chunkSearchQuery}
                                  onChange={(e) => setChunkSearchQuery(e.target.value)}
                                  className="h-9 w-64 pl-9 pr-8 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                  placeholder="搜索切片内容"
                                />
                                {chunkSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setChunkSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              {!isImageDetail && (
                              <div className="relative">
                                <select
                                  value={chunkStatusFilter}
                                  onChange={(e) => setChunkStatusFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
                                  className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                                >
                                  <option value="all">全部状态</option>
                                  <option value="enabled">启用</option>
                                  <option value="disabled">禁用</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                              </div>
                              )}
                            </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-4 no-scrollbar space-y-3">
                          {isAudioDetail ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8">
                              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
                                <Scissors className="h-5 w-5" />
                              </div>
                              <div className="mt-4 text-center">
                                <div className="text-sm font-semibold text-slate-800">音视频切片规则暂未配置</div>
                                <p className="mt-2 text-sm leading-6 text-slate-500">
                                  当前详情页已展示上传音视频对应的 ASR 转写原文、时间戳和播放器定位；后续配置音视频切片策略后，这里会展示按规则生成的切片结果。
                                </p>
                              </div>
                              <div className="mt-5 grid gap-2 rounded-lg bg-white p-3 text-xs leading-5 text-slate-500">
                                <div>已完成：时间顺序转写文本</div>
                                <div>已完成：点击原文定位播放时间</div>
                                <div>待配置：音视频切片策略与切片预览</div>
                              </div>
                            </div>
                          ) : isImageDetail ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                                {imageAnalysis?.imageType === 'structured'
                                  ? '结构化图片按语义切分：标题、字段和值、表格行、编号步骤和独立版块会分别成片，避免把整张图识别成一大段。'
                                  : '非结构化图片按整图描述、主要对象/场景和可见文字成片，只描述图片中能识别到的内容。'}
                              </div>
                              {filteredImageChunks.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                                  暂无匹配的图片切片
                                </div>
                              )}
                              {filteredImageChunks.map((chunk, index) => {
                                const isActive = activeImageChunk?.id === chunk.id;
                                const typeLabel = getImageChunkTypeLabel(chunk.chunkType || chunk.type || '');
                                const tone =
                                  chunk.chunkType === 'image_description' || chunk.chunkType?.includes('summary')
                                    ? 'bg-violet-50 text-violet-700'
                                    : chunk.chunkType === 'kv_field' || chunk.chunkType === 'table_header' || chunk.chunkType === 'ocr_text'
                                      ? 'bg-sky-50 text-sky-700'
                                      : chunk.chunkType === 'object' || chunk.chunkType === 'area' || chunk.chunkType === 'state'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : chunk.chunkType === 'relation' || chunk.chunkType === 'node_group' || chunk.chunkType === 'hierarchy'
                                          ? 'bg-amber-50 text-amber-700'
                                          : 'bg-blue-50 text-blue-700';
                                return (
                                  <button
                                    key={chunk.id || index}
                                    type="button"
                                    onClick={() => setActiveImageChunkId(chunk.id)}
                                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                                      isActive
                                        ? 'border-slate-400 bg-slate-50 shadow-sm'
                                        : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="mb-3 flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className={`text-xs font-bold ${isActive ? 'text-slate-600' : 'text-slate-400'}`}>#{index + 1}</div>
                                        <div className="mt-1 text-base font-semibold text-slate-900">{chunk.title || typeLabel}</div>
                                      </div>
                                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{typeLabel}</span>
                                    </div>
                                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{chunk.content}</p>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <>
                          {filteredChunks.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                              暂无符合当前状态的切片
                            </div>
                          )}
                          {filteredChunks.map((chunk) => {
                            const isActive = chunk.id === activeDocumentChunkId;
                            return (
                              <div
                                key={chunk.id}
                                onClick={() => setActiveDocumentChunkId(chunk.id)}
                                className={`cursor-pointer rounded-xl border p-4 transition-all ${
                                  isActive
                                    ? 'border-blue-500 bg-blue-50/60 shadow-sm'
                                    : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>#{chunk.id}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{chunk.type}</span>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      chunk.enabled
                                        ? 'bg-emerald-50 text-emerald-600'
                                        : 'bg-slate-100 text-slate-400'
                                    }`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${chunk.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                      {chunk.enabled ? '启用' : '禁用'}
                                    </span>
                                    <span className="text-[10px] text-slate-400">{chunk.chars} 字符</span>
                                  </div>
                                </div>
                                <p className="text-sm leading-6 text-slate-700 line-clamp-3">{chunk.text}</p>
                                {isActive && (
                                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-blue-100 pt-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setChunkEnabledMap(prev => ({ ...prev, [chunk.id]: !chunk.enabled }));
                                      }}
                                      className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-all ${
                                        chunk.enabled
                                          ? 'text-slate-500 hover:bg-red-50 hover:text-red-600'
                                          : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'
                                      }`}
                                    >
                                      <span className={`relative h-4 w-7 rounded-full transition-colors ${
                                        chunk.enabled ? 'bg-blue-600' : 'bg-slate-200'
                                      }`}>
                                        <span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                                          chunk.enabled ? 'translate-x-3.5' : 'translate-x-0'
                                        }`} />
                                      </span>
                                      {chunk.enabled ? '禁用' : '启用'}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingChunkId(chunk.id); setEditingChunkText(chunk.text); setShowChunkEditModal(true); }}
                                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-all"
                                    >
                                      <Edit className="w-3 h-3" /> 编辑
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                            </>
                          )}
                        </div>
                      </section>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          ) : showFileUploadPage ? (
            // 文件上传页面 - 重新设计
            <div className="flex-1 flex flex-col bg-white min-h-0">
              {/* 顶部步骤进度条 */}
              <div className="bg-white border-b border-slate-200 px-8 py-5 shrink-0">
                <div className="flex items-center justify-center">
                  {uploadStepItems.map((step, idx) => (
                    <div key={step.num} className="flex items-center">
                      {idx > 0 && <div className="w-16 h-px bg-slate-300 mx-5" />}
                      <div className="flex items-center gap-2.5">
                        <div className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                          fileUploadStep === step.num
                            ? 'bg-blue-600 text-white shadow-sm'
                            : fileUploadStep > step.num
                            ? 'bg-green-500 text-white'
                            : 'border border-slate-300 text-slate-400 bg-white'
                        }`}>
                          STEP {step.displayNum ?? step.num}
                        </div>
                        <span className={`text-sm ${
                          fileUploadStep === step.num ? 'font-semibold text-slate-800' : 'font-medium text-slate-400'
                        }`}>{step.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 1: 上传文件 */}
              {fileUploadStep === 1 && (
              <div className="flex-1 overflow-y-auto px-10 py-8" style={{paddingBottom: '88px'}}>
                <div className="max-w-[1180px] mx-auto space-y-8">

                  {/* 选择文件类型 */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <label className="text-sm font-semibold text-slate-700">选择文件类型</label>
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                      {[
                        { value: 'text', title: '导入文本文档', desc: '本地上传文档', icon: FileText, bg: 'bg-blue-50', color: 'text-blue-600' },
                        { value: 'table', title: '导入表格型知识', desc: '表格结构化知识', icon: Layout, bg: 'bg-emerald-50', color: 'text-emerald-600' },
                        { value: 'image', title: '导入图片文件', desc: '图片内容识别', icon: Image, bg: 'bg-orange-50', color: 'text-orange-600' },
                        { value: 'audio', title: '导入音频文件', desc: '语音转写入库', icon: Video, bg: 'bg-pink-50', color: 'text-pink-600' },
                        { value: 'web', title: '读取网页数据', desc: '单个网页链接', icon: Globe, bg: 'bg-violet-50', color: 'text-violet-600' }
                      ].map((item) => (
                        <button
                          key={item.value}
                          onClick={() => applyFileUploadType(item.value as typeof fileUploadFileType)}
                          className={`relative rounded-lg border px-3 py-3 text-left transition-all ${
                            fileUploadFileType === item.value
                              ? 'border-blue-500 bg-blue-50 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${item.bg}`}>
                            <item.icon className={`h-5 w-5 ${item.color}`} />
                          </div>
                          <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</div>
                          {fileUploadFileType === item.value && (
                            <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
                              <Check className="h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 导入来源 */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 mb-3 block">
                      {fileUploadFileType === 'web' ? '网页上传方式' : fileUploadFileType === 'table' ? '上传表格区' : fileUploadFileType === 'image' ? '上传图片区' : fileUploadFileType === 'audio' ? '上传音频区' : '上传文件区'}
                    </label>

                    {fileUploadFileType !== 'web' && (
                      <label
                        className="block border-2 border-dashed border-blue-300 rounded-2xl p-12 text-center hover:border-blue-500 hover:bg-blue-50/20 transition-all cursor-pointer"
                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50/30'); }}
                        onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/30'); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/30');
                          const files = Array.from(e.dataTransfer.files) as File[];
                          void handleFileUpload(files);
                        }}
                      >
                        <input
                          type="file"
                          multiple
                          accept={fileUploadFileType === 'table' ? '.xlsx,.xls,.csv,.json' : fileUploadFileType === 'image' ? '.png,.jpg,.jpeg,.bmp' : fileUploadFileType === 'audio' ? '.wav,.mp3,.m4a,.amr,.mp4,.mov,.avi' : '.doc,.txt,.docx,.pdf,.ppt,.pptx,.md'}
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []) as File[];
                            e.currentTarget.value = '';
                            void handleFileUpload(files);
                          }}
                        />
                        <Upload className="w-14 h-14 text-blue-500 mx-auto mb-4" />
                        <p className="text-base font-medium text-slate-700">
                          将{fileUploadFileType === 'table' ? '表格' : fileUploadFileType === 'image' ? '图片' : fileUploadFileType === 'audio' ? '音频' : '文档'}拖到此处，或<span className="text-blue-600 font-semibold">点击上传</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-3 leading-relaxed max-w-[560px] mx-auto">
                          {fileUploadFileType === 'table' && '支持 .xlsx / .xls / .csv / .json 文件格式，单个文件不超过 100MB。'}
                          {fileUploadFileType === 'image' && '支持 .png / .jpg / .jpeg / .bmp 文件格式，可识别图片中文字内容。'}
                          {fileUploadFileType === 'audio' && '支持 .wav / .mp3 / .m4a / .amr / .mp4 / .mov / .avi 文件格式，单个音视频文件不超过 1GB。'}
                          {fileUploadFileType === 'text' && '单次上传文档数量为100个；支持.doc/.txt/.docx/.pdf/.ppt/.pptx/.md七种格式。'}
                        </p>
                      </label>
                    )}

                    {fileUploadFileType === 'web' && (
                      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-slate-900">网页内容解析</span>
                            <span className="text-red-500">*</span>
                            <span className="group relative inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 text-xs text-slate-400">
                              ?
                              <span className="invisible absolute left-0 top-7 z-20 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
                                请确保拥有合法爬取权限；系统只抓取当前输入 URL 的正文内容，不解析子页面。
                              </span>
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-500">输入网页地址后，系统会抓取正文并进入下一步规则配置。</p>
                        </div>

                        <div className="space-y-5 p-5">
                          <div>
                            <div className="mb-2 text-sm font-semibold text-slate-700">网页地址</div>
                            <div className="flex gap-3">
                              <input
                                value={webUploadUrl}
                                onChange={(e) => setWebUploadUrl(e.target.value)}
                                placeholder="请输入一个需要解析的 URL，例如：https://example.com/article"
                                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                              <button
                                onClick={async () => {
                                  const url = webUploadUrl.trim();
                                  if (!url) {
                                    showToast('warning', '请输入网页链接');
                                    return;
                                  }
                                  await createWebFileFromUrl(url);
                                  setWebUploadUrl('');
                                }}
                                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700"
                              >
                                添加链接
                              </button>
                            </div>
                            {webAddedUrls.length > 0 && (
                              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate">已添加：{webAddedUrls[0].url}</div>
                                    <div className="mt-1 text-xs text-blue-500">
                                      {webAddedUrls[0].status === 'fetching' && '正在抓取网页正文...'}
                                      {webAddedUrls[0].status === 'success' && '网页正文已抓取，可进入下一步预览切片。'}
                                      {webAddedUrls[0].status === 'fallback' && '当前环境无法直接读取网页，已生成可预览的网页正文。'}
                                      {webAddedUrls[0].status === 'error' && '网页抓取失败，请更换链接。'}
                                    </div>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-blue-600">
                                    {uploadingFiles.find(file => file.id === webAddedUrls[0].id)?.status === 'success' ? '可处理' : '处理中'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition-all hover:border-blue-200 hover:bg-blue-50/50">
                              <input type="checkbox" checked readOnly className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">URL 去重</span>
                                <span className="mt-1 block text-xs leading-5 text-slate-500">自动跳过知识库内已存在的相同网页。</span>
                              </span>
                            </label>

                            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-200 hover:bg-blue-50/40">
                              <input
                                type="checkbox"
                                checked={webEnableHtmlFilter}
                                onChange={() => setWebEnableHtmlFilter(prev => !prev)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                              />
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">限定解析范围</span>
                                <span className="mt-1 block text-xs leading-5 text-slate-500">使用 CSS 选择器只解析正文区域。</span>
                              </span>
                            </label>

                            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-all hover:border-blue-200 hover:bg-blue-50/40">
                              <input
                                type="checkbox"
                                checked={webExtractLinks}
                                onChange={() => setWebExtractLinks(prev => !prev)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                              />
                              <span>
                                <span className="block text-sm font-semibold text-slate-800">保留超链接</span>
                                <span className="mt-1 block text-xs leading-5 text-slate-500">保留文本与图片的原网页链接。</span>
                              </span>
                            </label>
                          </div>

                          {webEnableHtmlFilter && (
                            <div>
                              <label className="mb-2 block text-sm font-semibold text-slate-700">CSS 选择器</label>
                              <input
                                value={webHtmlSelector}
                                onChange={(e) => setWebHtmlSelector(e.target.value)}
                                placeholder="例如 div.container p"
                                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* 文件列表 */}
                  {uploadingFiles.length > 0 && (() => {
	                    const displayFiles = fileUploadShowProblems
	                      ? uploadingFiles.filter(f => f.status === 'error')
	                      : uploadingFiles;
	                    const problemFileCount = uploadingFiles.filter(f => f.status === 'error').length;
                    const pageSize = 10;
                    const totalPages = Math.ceil(displayFiles.length / pageSize);
                    const pagedFiles = displayFiles.slice((fileUploadListPage - 1) * pageSize, fileUploadListPage * pageSize);
                    const getFileIcon = (name: string) => {
                      const ext = name.split('.').pop()?.toLowerCase();
                      if (ext === 'pdf') return { bg: 'bg-red-100', text: 'text-red-600', label: 'PDF' };
                      if (ext === 'docx' || ext === 'doc') return { bg: 'bg-blue-100', text: 'text-blue-700', label: (ext || '').toUpperCase() };
                      if (ext === 'pptx' || ext === 'ppt') return { bg: 'bg-orange-100', text: 'text-orange-600', label: (ext || '').toUpperCase() };
                      if (ext === 'txt') return { bg: 'bg-slate-100', text: 'text-slate-600', label: 'TXT' };
                      if (ext === 'md') return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'MD' };
                      return { bg: 'bg-slate-100', text: 'text-slate-500', label: (ext || 'FILE').toUpperCase() };
                    };
                    return (
                      <div>
                        {/* 列表标题 */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Upload className="w-4 h-4 text-slate-500" />
                            <span className="text-sm font-semibold text-slate-700">文件数 - （共计 {uploadingFiles.length}）</span>
                          </div>
	                          {problemFileCount > 0 && (
	                            <div className="flex items-center gap-2 text-sm">
	                              <span className="text-slate-500">筛选：</span>
	                              <input
	                                type="checkbox"
	                                checked={fileUploadShowProblems}
	                                onChange={(e) => { setFileUploadShowProblems(e.target.checked); setFileUploadListPage(1); }}
	                                className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
	                              />
	                              <span className="text-red-500 font-medium">问题文件 ({problemFileCount})</span>
	                            </div>
	                          )}
                        </div>
                        {/* 文件行列表 */}
                        <div className="border border-slate-200 rounded-xl overflow-visible divide-y divide-slate-100">
                          {pagedFiles.map((file) => {
                            const fi = getFileIcon(file.name);
                            const isErr = file.status === 'error';
                            const problemReason = file.problemReason || '文件解析异常，请移除后重新上传。';
                            const audioSegments = file.sourceType === 'audio'
                              ? getAudioTranscriptSegments({
                                  name: file.name,
                                  content: file.content,
                                  asrText: file.asrText,
                                  asrSegments: file.asrSegments
                                })
                              : [];
                            return (
                              <div key={file.id} className={`group relative flex items-center gap-3 px-4 py-3 ${
                                isErr ? 'bg-red-50' : 'bg-white hover:bg-slate-50'
                              }`}>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${fi.bg}`}>
                                  <span className={`text-xs font-bold ${fi.text}`}>{fi.label}</span>
                                </div>
                                <span className={`flex-1 text-sm truncate ${isErr ? 'text-red-600 font-medium' : 'text-slate-800'}`}>
                                  {file.name}
                                  </span>
                                  {file.parseNote && (
                                    <span className="hidden max-w-[280px] truncate text-xs text-slate-400 xl:inline">
                                    {file.parseNote}
                                  </span>
                                  )}
                                {isErr && (
                                  <div className="group relative shrink-0">
                                    <span className="inline-flex cursor-default items-center gap-1 rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      问题文件
                                    </span>
                                    <div className="pointer-events-none invisible absolute bottom-full right-0 z-40 mb-2 w-72 rounded-lg border border-red-100 bg-white p-3 text-left text-xs leading-5 text-slate-700 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
                                      <div className="mb-1 font-semibold text-red-600">问题原因（仅查看）</div>
                                      <div>{problemReason}</div>
                                    </div>
                                  </div>
                                )}
                                {!isErr && file.sourceType === 'audio' && (
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span
                                      title={file.asrMessage}
                                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                        file.asrStatus === 'ready' && audioSegments.length > 0
                                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                          : file.asrStatus === 'processing'
                                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                                            : 'bg-red-50 text-red-600 ring-1 ring-red-100'
                                      }`}
                                    >
                                      {file.asrStatus === 'ready' && audioSegments.length > 0
                                        ? `ASR 已转写 ${audioSegments.length} 段`
                                        : file.asrStatus === 'processing'
                                          ? 'ASR 转写中'
                                          : file.asrMessage || 'ASR 未生成文本'}
                                    </span>
                                    {file.asrStatus !== 'ready' && file.asrStatus !== 'processing' && file.rawFile && (
                                      <button
                                        type="button"
                                        onClick={() => retryAudioTranscription(file.id)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        重新转写
                                      </button>
                                    )}
                                  </div>
                                )}
                                {file.status === 'uploading' && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="w-24 bg-slate-200 rounded-full h-1.5">
                                      <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${file.progress}%` }} />
                                    </div>
                                    <span className="text-xs text-slate-400 w-8 text-right">{file.progress}%</span>
                                  </div>
                                )}
                                <button
	                                  onClick={() => {
	                                    setUploadingFiles(prev => {
	                                      const next = prev.filter(f => f.id !== file.id);
	                                      if (!next.some(f => f.status === 'error')) {
	                                        setFileUploadShowProblems(false);
	                                      }
	                                      return next;
	                                    });
	                                  }}
                                  className="p-1 text-slate-300 hover:text-slate-600 transition-colors shrink-0"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {fileUploadFileType === 'audio' && uploadingFiles.some(file => file.sourceType === 'audio' && file.status === 'success' && !isAudioUploadReady(file)) && (
                          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                            音视频需要完成真实 ASR 转写后才能继续入库。当前本地 ASR 服务已支持 mp3 / wav / m4a / mp4 等格式；如果某个文件失败，请先点击“重新转写”，仍失败时再检查音频是否有人声或文件是否损坏。
                          </div>
                        )}
                        {/* 分页 */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-1 mt-4">
                            <button
                              disabled={fileUploadListPage <= 1}
                              onClick={() => setFileUploadListPage(p => p - 1)}
                              className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4 text-slate-600" />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                              <button
                                key={page}
                                onClick={() => setFileUploadListPage(page)}
                                className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                                  fileUploadListPage === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {page}
                              </button>
                            ))}
                            <button
                              disabled={fileUploadListPage >= totalPages}
                              onClick={() => setFileUploadListPage(p => p + 1)}
                              className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors"
                            >
                              <ChevronRight className="w-4 h-4 text-slate-600" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>
              </div>
              )}

	              {/* Step 2: 规则配置 */}
              {fileUploadStep === 2 && (
              <div className="flex-1 flex gap-0 overflow-hidden" style={{paddingBottom: '72px'}}>
                <div className="flex gap-6 h-full w-full px-8 py-8 max-w-[1440px] mx-auto">

                  {/* 左侧：分段设置 */}
                  <div className="w-[480px] shrink-0 overflow-y-auto">
                    <div className="border border-slate-200 bg-white rounded-xl p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 text-blue-600">
                          {(() => {
                            const UploadIcon = selectedStep2UploadType.icon;
                            return <UploadIcon className="w-5 h-5" />;
                          })()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{selectedStep2UploadType.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{selectedStep2UploadType.desc}</div>
                        </div>
                      </div>
                    </div>

                    {isStep2GenericSliceType && (
                      <>
                        {fileUploadFileType === 'audio' && (
                          <div className="mt-5 border border-slate-200 bg-white rounded-xl p-5 space-y-5">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 bg-pink-50 rounded-lg flex items-center justify-center shrink-0">
                                <Video className="w-5 h-5 text-pink-600" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-slate-800">音频解析配置</div>
                                <div className="text-xs text-slate-500 mt-0.5">配置如何通过语音识别（ASR）将音频文件转换为文本，并进行基础清洗。</div>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-800">解析方式</div>
                                  <div className="mt-1 text-xs leading-5 text-slate-500">决定音频转写后的文本组织方式。</div>
                                </div>
                                <span className="shrink-0 whitespace-nowrap rounded-full bg-pink-50 px-3 py-1 text-[11px] font-semibold leading-none text-pink-700 ring-1 ring-pink-100">Parsing Mode</span>
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                {[
                                  { value: 'full', title: '整段识别', desc: '将整个音频文件转写为一整段连续文本，适合会议录音、讲座。', recommended: true },
                                  { value: 'sentence', title: '分句识别', desc: '根据静音停顿自动切分成多个短句，适合访谈、对话。' }
                                ].map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setStep2AudioParseConfig(prev => ({ ...prev, parseMode: option.value }))}
                                    className={`min-h-[118px] rounded-xl border p-3 text-left transition-all ${
                                      step2AudioParseConfig.parseMode === option.value
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        {renderRecommendedTitle(option.title, option.recommended)}
                                      </div>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2AudioParseConfig.parseMode === option.value
                                          ? 'border-blue-600 bg-blue-600'
                                          : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2AudioParseConfig.parseMode === option.value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs leading-5 text-slate-500">{option.desc}</p>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-800">ASR 识别配置</div>
                                  <div className="mt-1 text-xs leading-5 text-slate-500">调整语音转文字的参数，提升识别准确率。</div>
                                </div>
                                <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold leading-none text-slate-600">ASR Configuration</span>
                              </div>

                              <div className="mt-4">
                                <div className="mb-2 text-sm font-medium text-slate-700">识别语言</div>
                                <div className="grid gap-2">
                                  {[
                                  { value: 'auto', title: '自动识别', desc: '系统自动判断语种。', recommended: true },
                                  { value: 'zh', title: '中文', desc: '强制按中文识别。' },
                                  { value: 'en', title: '英文', desc: '强制按英文识别。' }
                                ].map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setStep2AudioParseConfig(prev => ({ ...prev, languageMode: option.value }))}
                                      className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                        step2AudioParseConfig.languageMode === option.value
                                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                          : 'border-slate-200 bg-white hover:border-blue-200'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        {renderRecommendedTitle(option.title, option.recommended)}
                                        <p className="mt-1 text-xs leading-5 text-slate-500">{option.desc}</p>
                                      </div>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2AudioParseConfig.languageMode === option.value
                                          ? 'border-blue-600 bg-blue-600'
                                          : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2AudioParseConfig.languageMode === option.value && (
                                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                        )}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="mt-4">
                                <div className="mb-2 text-sm font-medium text-slate-700">降噪增强</div>
                                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                                  <button
                                    type="button"
                                    onClick={() => setStep2AudioParseConfig(prev => ({ ...prev, noiseReduction: !prev.noiseReduction }))}
                                    className="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
                                  >
                                    <span className="min-w-0">
                                      <span className="block text-sm font-semibold text-slate-900">开启降噪增强</span>
                                      <span className="mt-1 block text-xs leading-5 text-slate-500">去除背景杂音、电流声，提高人声清晰度。</span>
                                    </span>
                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                      step2AudioParseConfig.noiseReduction ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                    }`}>
                                      {step2AudioParseConfig.noiseReduction && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {fileUploadFileType === 'web' && (
                          <div className="mt-5 border border-slate-200 bg-white rounded-xl p-5 space-y-5">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
                                <Globe className="w-5 h-5 text-violet-600" />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-slate-800">网页解析配置</div>
                                <div className="text-xs text-slate-500 mt-0.5">配置网页内容的抓取与正文提取方式。提取出的正文将进入统一的文本预处理流程。</div>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-800">解析方式</div>
                                  <div className="mt-1 text-xs leading-5 text-slate-500">选择网页文本提取范围，决定进入后续预处理的正文内容。</div>
                                </div>
                                <span className="shrink-0 whitespace-nowrap rounded-full bg-violet-50 px-3 py-1 text-[11px] font-semibold leading-none text-violet-700 ring-1 ring-violet-100">Parsing Mode</span>
                              </div>
                              <div className="mt-4 grid gap-2">
                                {[
                                  { value: 'main', title: '自动提取正文', desc: '自动识别网页中的正文区域，过滤导航、广告、版权等信息。', recommended: true },
                                  { value: 'all', title: '提取全部文字', desc: '去除网页标签后，保留页面中所有文字内容。' }
                                ].map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setStep2WebParseConfig(prev => ({ ...prev, parseMode: option.value }))}
                                    className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2WebParseConfig.parseMode === option.value
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      {renderRecommendedTitle(option.title, option.recommended)}
                                      <p className="mt-1 text-xs leading-5 text-slate-500">{option.desc}</p>
                                    </div>
                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                      step2WebParseConfig.parseMode === option.value
                                        ? 'border-blue-600 bg-blue-600'
                                        : 'border-slate-300 bg-white'
                                    }`}>
                                      {step2WebParseConfig.parseMode === option.value && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                      )}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-800">网页提取配置</div>
                                  <div className="mt-1 text-xs leading-5 text-slate-500">控制网页编码识别、内容清洗和保留信息。</div>
                                </div>
                                <span className="shrink-0 whitespace-nowrap rounded-full bg-violet-50 px-3 py-1 text-[11px] font-semibold leading-none text-violet-700 ring-1 ring-violet-100">Web Extraction Config</span>
                              </div>

                              <div className="mt-4 space-y-4">
                                <div>
                                  <div className="mb-2 text-sm font-medium text-slate-700">编码识别</div>
                                  <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-500 bg-blue-50 p-3 ring-1 ring-blue-100">
                                    <div className="min-w-0">
                                      {renderRecommendedTitle('自动识别', true)}
                                      <div className="mt-1 text-xs leading-5 text-slate-500">系统优先读取网页声明的编码格式；若无法识别或声明有误，将自动探测实际编码，确保中文内容正常显示。</div>
                                    </div>
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-600 bg-blue-600">
                                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                    </span>
                                  </div>
                                </div>

                                <div>
                                  <div className="mb-2 text-sm font-medium text-slate-700">内容清洗</div>
                                  <div className="grid gap-3">
                                    <button
                                      type="button"
                                      onClick={() => setStep2WebParseConfig(prev => ({ ...prev, removeScriptsAndStyles: !prev.removeScriptsAndStyles }))}
                                      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2WebParseConfig.removeScriptsAndStyles
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}
                                    >
                                      <span className="min-w-0">
                                        <span className="block text-sm font-semibold leading-5 text-slate-900">移除脚本与样式代码</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">过滤脚本、样式等非正文代码，减少无效内容进入知识库。</span>
                                      </span>
                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                      step2WebParseConfig.removeScriptsAndStyles ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                    }`}>
                                      {step2WebParseConfig.removeScriptsAndStyles && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                    </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setStep2WebParseConfig(prev => ({ ...prev, removeChrome: !prev.removeChrome }))}
                                      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2WebParseConfig.removeChrome
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}
                                    >
                                      <span className="min-w-0">
                                        <span className="block text-sm font-semibold leading-5 text-slate-900">移除导航栏、页脚、侧边栏等非正文内容</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">清理页面外围区域，只保留正文相关内容。</span>
                                      </span>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2WebParseConfig.removeChrome ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2WebParseConfig.removeChrome && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <div className="mb-2 text-sm font-medium text-slate-700">保留信息</div>
                                  <div className="flex cursor-default items-start justify-between gap-3 rounded-xl border border-blue-500 bg-blue-50 p-3 ring-1 ring-blue-100">
                                    <span className="min-w-0">
                                      <span className="block text-sm font-semibold leading-5 text-slate-900">页面标题</span>
                                      <span className="mt-1 block text-xs leading-5 text-slate-500">页面标题会作为摘要或元数据保留。</span>
                                    </span>
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-600 bg-blue-600">
                                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="mt-5 border border-slate-200 bg-white rounded-xl p-5 space-y-5">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                              <Scissors className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-800">切片方法</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {fileUploadFileType === 'audio' ? '音频转写后选择文本切片策略' : fileUploadFileType === 'web' ? '网页正文抓取后选择切片策略' : '选择文档切片策略'}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            {visibleStep2SliceMethodOptions.map((method) => {
                              const MethodIcon = method.icon;
                              const selected = step2SliceMethod === method.key;
                              return (
                                <button
                                  key={method.key}
                                  type="button"
                                  data-slice-method={method.key}
                                  onClick={() => applyStep2SliceMethod(method.key)}
                                  className={`min-h-[56px] rounded-lg border px-3 py-3 text-left transition-all ${
                                    selected
                                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                                      : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                      selected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                    }`}>
                                      {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                    </span>
                                    <div className="min-w-0">
                                      <div className={`flex items-center gap-1.5 text-sm font-semibold ${selected ? 'text-blue-700' : 'text-slate-800'}`}>
                                        <MethodIcon className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{method.title}</span>
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-5 border border-slate-200 bg-white rounded-xl p-5 space-y-5">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 text-blue-600">
                              {(() => {
                                const SelectedIcon = selectedStep2SliceMethod.icon;
                                return <SelectedIcon className="w-5 h-5" />;
                              })()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-800">分段设置</div>
                              <div className="text-xs text-slate-500 mt-0.5">配置当前切片方式的基础参数</div>
                            </div>
                          </div>

                          {step2SliceMethod === 'smart' && (
                            <div className="grid gap-3">
                              {renderDelimiterField()}
                              {renderNumberField('分段最大长度', step2SmartConfig.maxLength, (value) => setStep2SmartConfig(prev => ({ ...prev, maxLength: value })), 1000)}
                              {renderNumberField('分段重叠长度', step2SmartConfig.overlap, (value) => setStep2SmartConfig(prev => ({ ...prev, overlap: value })), 0, '相邻切片保留一小段重复内容，避免上下文在边界处断开。')}
                            </div>
                          )}

                          {step2SliceMethod === 'title' && (
                            <div className="grid gap-3">
                              {renderSelectField('标题层级深度', step2TitleConfig.titleDepth, (value) => setStep2TitleConfig(prev => ({ ...prev, titleDepth: value })), ['一级', '二级', '三级', '所有'], '按照一级、二级、三级或所有标题层级切分文本。')}
                              {renderNumberField('分段最大长度', step2TitleConfig.maxLength, (value) => setStep2TitleConfig(prev => ({ ...prev, maxLength: value })), 1500)}
                              {renderNumberField('分段重叠长度', step2TitleConfig.overlap, (value) => setStep2TitleConfig(prev => ({ ...prev, overlap: value })), 0)}
                            </div>
                          )}

                          {step2SliceMethod === 'record' && (
                            <div className="grid gap-3">
                              {renderSelectField('记录单位', step2RecordConfig.recordUnit, (value) => setStep2RecordConfig(prev => ({ ...prev, recordUnit: value })), ['自动识别', '每个问答对', '每一行表格', '每条记录'])}
                              {renderNumberField('分段最大长度', step2RecordConfig.maxLength, (value) => setStep2RecordConfig(prev => ({ ...prev, maxLength: value })), 1200)}
                              {renderNumberField('分段重叠长度', step2RecordConfig.overlap, (value) => setStep2RecordConfig(prev => ({ ...prev, overlap: value })), 0, '问答和表格记录通常不需要太大重叠。')}
                            </div>
                          )}

                          {step2SliceMethod === 'page' && (
                            <div className="grid gap-3">
                              {renderSelectField('切分单位', step2PageConfig.pageUnit, (value) => setStep2PageConfig(prev => ({ ...prev, pageUnit: value })), ['每页一块', '每 2 页合并一块'])}
                              {renderSwitchField('保留页码', step2PageConfig.keepPageNumber, (checked) => setStep2PageConfig(prev => ({ ...prev, keepPageNumber: checked })))}
                              {renderSelectField('OCR 识别', step2PageConfig.ocrMode, (value) => setStep2PageConfig(prev => ({ ...prev, ocrMode: value })), ['自动', '开启', '关闭'], '扫描件或图片型 PDF 需要 OCR，自动模式会根据文件内容判断。')}
                            </div>
                          )}

                          <div className="flex items-center gap-4 pt-1">
                            <button
                              onClick={() => refreshStep2Preview()}
                              className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-300 rounded-lg text-sm font-medium hover:bg-blue-50 transition-all"
                            >
                              <Search className="w-3.5 h-3.5" />
                              预览块
                            </button>
                            <button
                              onClick={resetStep2SliceConfig}
                              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                            >
                              重置
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {fileUploadFileType === 'table' && (
                      <div className="mt-5 border border-slate-200 bg-white rounded-xl p-5 space-y-5">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0">
                            <FileStack className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800">表格解析配置</div>
                            <div className="text-xs text-slate-500 mt-0.5">配置如何将上传的表格文件解析为可检索的文本内容，包含解析方式和结构化转换规则。</div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                          <div>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-slate-800">解析方式</div>
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold leading-none text-emerald-700 ring-1 ring-emerald-100">Parsing Mode</span>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">选择表格的整体解析策略，决定数据的基本组织形态。</div>
                          </div>
                          <div className="mt-4 grid gap-2">
                            {[
                              {
                                value: 'row',
                                title: '逐行提取',
                                desc: '将表格的每一行视为一条独立记录，适合大多数业务数据。',
                                recommended: true
                              },
                              {
                                value: 'whole',
                                title: '整表聚合',
                                desc: '将整个表格作为一个整体文档处理，适合说明性表格或清单。'
                              }
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setStep2TableParseConfig(prev => ({ ...prev, parseMode: option.value }))}
                                className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                  step2TableParseConfig.parseMode === option.value
                                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                    : 'border-slate-200 bg-white hover:border-blue-200'
                                }`}
                              >
                                <div className="min-w-0">
                                  {renderRecommendedTitle(option.title, option.recommended)}
                                  <p className="mt-1 text-xs leading-5 text-slate-500">{option.desc}</p>
                                </div>
                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                  step2TableParseConfig.parseMode === option.value
                                    ? 'border-blue-600 bg-blue-600'
                                    : 'border-slate-300 bg-white'
                                }`}>
                                  {step2TableParseConfig.parseMode === option.value && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                          <div>
                            <div className="text-sm font-semibold text-slate-800">结构化转换配置</div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">对解析后的行列数据进行结构化处理与语义转换。</div>
                          </div>

                          <div className="mt-4 space-y-3">
                            <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-slate-200">
                              <div className="mb-3 text-xs font-semibold text-slate-500">文件解析配置</div>
                              <div className="space-y-3">
                                <div>
                                  <div className="mb-2 text-sm font-medium text-slate-700">表头识别</div>
                                  <div className="flex flex-wrap items-center gap-4">
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                                      <input
                                        type="radio"
                                        checked={step2TableParseConfig.headerDetection === 'auto'}
                                        onChange={() => setStep2TableParseConfig(prev => ({ ...prev, headerDetection: 'auto' }))}
                                        className="h-4 w-4 accent-blue-600"
                                      />
                                      自动识别首行
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                                      <input
                                        type="radio"
                                        checked={step2TableParseConfig.headerDetection === 'specified'}
                                        onChange={() => setStep2TableParseConfig(prev => ({ ...prev, headerDetection: 'specified' }))}
                                        className="h-4 w-4 accent-blue-600"
                                      />
                                      指定行号
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={step2TableParseConfig.headerRow}
                                      onChange={(e) => setStep2TableParseConfig(prev => ({ ...prev, headerRow: Math.max(1, Number(e.target.value) || 1), headerDetection: 'specified' }))}
                                      className="h-9 w-20 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <div className="mb-2 text-sm font-medium text-slate-700">空行处理</div>
                                  <div className="grid gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setStep2TableParseConfig(prev => ({
                                        ...prev,
                                        skipEmptyRows: !prev.skipEmptyRows,
                                        keepEmptyRows: !prev.skipEmptyRows ? false : prev.keepEmptyRows
                                      }))}
                                      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2TableParseConfig.skipEmptyRows
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                      }`}>
                                      <span className="min-w-0">
                                        {renderRecommendedTitle('自动跳过全空行', true)}
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">跳过没有任何有效内容的空白行。</span>
                                      </span>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2TableParseConfig.skipEmptyRows ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2TableParseConfig.skipEmptyRows && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setStep2TableParseConfig(prev => ({
                                        ...prev,
                                        keepEmptyRows: !prev.keepEmptyRows,
                                        skipEmptyRows: !prev.keepEmptyRows ? false : prev.skipEmptyRows
                                      }))}
                                      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2TableParseConfig.keepEmptyRows
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}>
                                      <span className="min-w-0">
                                        <span className="block text-sm font-semibold leading-5 text-slate-900">保留空行</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">保留空白行作为原始结构的一部分。</span>
                                      </span>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2TableParseConfig.keepEmptyRows ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2TableParseConfig.keepEmptyRows && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-slate-200">
                              <div className="mb-3 text-xs font-semibold text-slate-500">结构化转换方式</div>
                              <div className="space-y-3">
                                <div>
                                  <div className="mb-2 text-sm font-medium text-slate-700">转换模式</div>
                                  <div className="grid gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setStep2TableParseConfig(prev => ({ ...prev, conversionMode: 'markdown' }))}
                                      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2TableParseConfig.conversionMode === 'markdown'
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}>
                                      <span className="min-w-0">
                                        <span className="block text-sm font-semibold leading-5 text-slate-900">保留原始表格结构</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">保留行列关系，适合需要还原表格结构的内容。</span>
                                      </span>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2TableParseConfig.conversionMode === 'markdown' ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2TableParseConfig.conversionMode === 'markdown' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setStep2TableParseConfig(prev => ({ ...prev, conversionMode: 'natural' }))}
                                      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2TableParseConfig.conversionMode === 'natural'
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}>
                                      <span className="min-w-0">
                                        <span className="flex flex-wrap items-center gap-2">
                                          <span className="text-sm font-semibold leading-5 text-slate-900">转换为自然语言描述</span>
                                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold leading-none text-blue-700">推荐</span>
                                        </span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">将行列内容转成可直接检索的描述文本。</span>
                                      </span>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2TableParseConfig.conversionMode === 'natural' ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2TableParseConfig.conversionMode === 'natural' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {step2TableParseConfig.conversionMode === 'natural' && (
                                  <div>
                                    <div className="mb-2 text-sm font-medium text-slate-700">描述模板（可选）</div>
                                    <div className="space-y-2">
                                      {(step2TableParseConfig.descriptionFields || []).map((field, index) => (
                                        <div key={index} className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-2">
                                          <input
                                            value={field.header}
                                            onChange={(e) => setStep2TableParseConfig(prev => ({
                                              ...prev,
                                              descriptionFields: prev.descriptionFields.map((item, itemIndex) => itemIndex === index ? { ...item, header: e.target.value } : item)
                                            }))}
                                            placeholder={`表头${index + 1}`}
                                            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                          />
                                          <span className="text-center text-sm font-semibold text-slate-500">为</span>
                                          <input
                                            value={field.value}
                                            onChange={(e) => setStep2TableParseConfig(prev => ({
                                              ...prev,
                                              descriptionFields: prev.descriptionFields.map((item, itemIndex) => itemIndex === index ? { ...item, value: e.target.value } : item)
                                            }))}
                                            placeholder={`值${index + 1}`}
                                            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setStep2TableParseConfig(prev => ({
                                        ...prev,
                                        descriptionFields: [...(prev.descriptionFields || []), { header: `表头${(prev.descriptionFields || []).length + 1}`, value: `值${(prev.descriptionFields || []).length + 1}` }]
                                      }))}
                                      className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                                    >
                                      + 添加字段
                                    </button>
                                  </div>
                                )}

                                <div>
                                  <div className="mb-2 text-sm font-medium text-slate-700">多行合并策略</div>
                                  <div className="grid gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setStep2TableParseConfig(prev => ({ ...prev, mergeStrategy: 'singleRow' }))}
                                      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2TableParseConfig.mergeStrategy === 'singleRow'
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}>
                                      <span className="min-w-0">
                                        <span className="block text-sm font-semibold leading-5 text-slate-900">每行独立</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">每一行生成一条独立知识记录。</span>
                                      </span>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2TableParseConfig.mergeStrategy === 'singleRow' ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2TableParseConfig.mergeStrategy === 'singleRow' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setStep2TableParseConfig(prev => ({ ...prev, mergeStrategy: 'primaryKey' }))}
                                      className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                      step2TableParseConfig.mergeStrategy === 'primaryKey'
                                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                        : 'border-slate-200 bg-white hover:border-blue-200'
                                    }`}>
                                      <span className="min-w-0">
                                        <span className="block text-sm font-semibold leading-5 text-slate-900">按主键合并</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">相同主键的多行内容合并为一条记录。</span>
                                      </span>
                                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                        step2TableParseConfig.mergeStrategy === 'primaryKey' ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                                      }`}>
                                        {step2TableParseConfig.mergeStrategy === 'primaryKey' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      </span>
                                    </button>
                                  </div>
                                  {step2TableParseConfig.mergeStrategy === 'primaryKey' && (
                                    <div className="mt-3 flex items-center gap-2">
                                      <span className="text-xs text-slate-500">主键字段</span>
                                      <input
                                        value={step2TableParseConfig.primaryKeyField}
                                        onChange={(e) => setStep2TableParseConfig(prev => ({ ...prev, primaryKeyField: e.target.value }))}
                                        placeholder="如 员工ID"
                                        className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => refreshStep2Preview()}
                          className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-300 rounded-lg text-sm font-medium hover:bg-blue-50 transition-all"
                        >
                          <Search className="w-3.5 h-3.5" />
                          生成预览
                        </button>
                      </div>
                    )}

                    {fileUploadFileType === 'image' && (
                      <div className="mt-5 border border-slate-200 bg-white rounded-xl p-5 space-y-5">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                            <Image className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800">图片解析配置</div>
                            <div className="text-xs text-slate-500 mt-0.5">配置图片文件的 OCR 识别方式。识别结果将进入文本预处理流程。</div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-800">解析方式</div>
                              <div className="mt-1 text-xs leading-5 text-slate-500">图片文件统一按整张图片进行 OCR 识别。</div>
                            </div>
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold leading-none text-orange-700 ring-1 ring-orange-100">Image Parsing Config</span>
                          </div>
                          <div className="mt-4 min-h-[118px] rounded-xl border border-blue-200 bg-blue-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                {renderRecommendedTitle('全图识别', true)}
                                <div className="mt-1 text-xs leading-5 text-slate-500">将整张图片作为识别对象，适合截图、扫描件、票据和图片文档。</div>
                              </div>
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-600 bg-blue-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-800">OCR 语言模式</div>
                              <div className="mt-1 text-xs leading-5 text-slate-500">系统将根据选择调用对应的 OCR 模型。</div>
                            </div>
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold leading-none text-slate-600">OCR Language Mode</span>
                          </div>
                          <div className="mt-4 grid gap-2">
                            {[
                              { value: 'auto', title: '自动识别', desc: '系统自动判断中英混合、纯中文或纯英文，调用最优模型。', recommended: true },
                              { value: 'zh', title: '仅中文', desc: '国内业务首选。' },
                              { value: 'en', title: '仅英文', desc: '外单、护照类图片。' }
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setStep2ImageQaConfig(prev => ({ ...prev, ocrLanguageMode: option.value }))}
                                className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                  step2ImageQaConfig.ocrLanguageMode === option.value
                                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100'
                                    : 'border-slate-200 bg-white hover:border-blue-200'
                                }`}
                              >
                                <div className="min-w-0">
                                  {renderRecommendedTitle(option.title, option.recommended)}
                                  <p className="mt-1 text-xs leading-5 text-slate-500">{option.desc}</p>
                                </div>
                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                  step2ImageQaConfig.ocrLanguageMode === option.value
                                    ? 'border-blue-600 bg-blue-600'
                                    : 'border-slate-300 bg-white'
                                }`}>
                                  {step2ImageQaConfig.ocrLanguageMode === option.value && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                          <div className="text-sm font-semibold text-slate-800">方向校正</div>
                          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                            <button
                              type="button"
                              onClick={() => setStep2ImageQaConfig(prev => ({ ...prev, orientationCorrection: true }))}
                              className="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-slate-900">自动旋转校正</span>
                                <span className="mt-1 block text-xs leading-5 text-slate-500">自动转正横屏、倒立图片，提升识别率。</span>
                              </span>
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-600 bg-blue-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              </span>
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 pt-1">
                          <button
                            onClick={() => refreshStep2Preview()}
                            className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-300 rounded-lg text-sm font-medium hover:bg-blue-50 transition-all"
                          >
                            <Search className="w-3.5 h-3.5" />
                            预览块
                          </button>
                          <button
                            onClick={() => {
                              setStep2ImageQaConfig({
                                parseMode: 'fullImage',
                                ocrLanguageMode: 'auto',
                                orientationCorrection: true
                              });
                              setStep2PreviewChunks([]);
                              setStep2ShowPreview(false);
                            }}
                            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            重置
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-5 border border-slate-200 bg-white rounded-xl p-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                          <Tag className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">文件标签</div>
                          <div className="text-xs text-slate-500 mt-0.5">给本次上传的文件添加标签；系统会优先根据文件内容识别主题、类型和业务关键词自动生成，可继续手动添加或删除。</div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <input
                          value={fileUploadTagInput}
                          onChange={(e) => setFileUploadTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const tag = fileUploadTagInput.trim();
                            if (!tag) return;
                            if (!fileUploadTags.includes(tag)) {
                              setFileUploadTags(prev => [...prev, tag]);
                            }
                            setFileUploadTagInput('');
                          }}
                          placeholder="输入标签后按 Enter 添加"
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const tag = fileUploadTagInput.trim();
                            if (!tag) return;
                            if (!fileUploadTags.includes(tag)) {
                              setFileUploadTags(prev => [...prev, tag]);
                            }
                            setFileUploadTagInput('');
                          }}
                          className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-600 transition-all hover:bg-blue-50"
                        >
                          添加
                        </button>
                      </div>

                      {(fileUploadTags.length > 0 || uploadingFiles.length > 0) && (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                            {fileUploadTags.map((tag) => (
                              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => setFileUploadTags(prev => prev.filter(item => item !== tag))}
                                  className="text-blue-400 hover:text-blue-700"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          {uploadingFiles.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextGeneration = fileUploadTagGenerationCount + 1;
                                const autoTags = generateFileUploadTags(
                                  fileUploadFileType,
                                  uploadingFiles.map(file => ({ name: file.name, url: file.sourceUrl, content: file.content })),
                                  nextGeneration
                                );
                                setFileUploadTagGenerationCount(nextGeneration);
                                setAutoGeneratedFileTags(autoTags);
                                setFileUploadTags(prev => {
                                  const manualTags = prev.filter(tag => !autoGeneratedFileTags.includes(tag));
                                  return Array.from(new Set([...manualTags, ...autoTags]));
                                });
                              }}
                              className="shrink-0 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-all hover:bg-blue-50"
                            >
                              重新生成
                            </button>
                          )}
                        </div>
                      )}

                    </div>

	                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 space-y-5">
	                      <div className="flex items-start gap-3">
	                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
	                          <Wand2 className="w-5 h-5 text-slate-600" />
	                        </div>
	                        <div>
	                          <div className="text-sm font-semibold text-slate-800">文本预处理规则</div>
	                          <div className="text-xs text-slate-500 mt-0.5">入库前对原文进行基础清洗，减少噪声内容影响召回</div>
	                        </div>
	                      </div>
	                      <div className="space-y-2.5">
	                        <button
	                          type="button"
	                          onClick={() => setStep2ReplaceSpaces(prev => !prev)}
	                          className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
	                          step2ReplaceSpaces ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
	                        }`}
	                        >
	                          <span className="min-w-0 text-sm text-slate-700">替换掉连续的空格、换行符和制表符</span>
	                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
	                            step2ReplaceSpaces ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
	                          }`}>
	                            {step2ReplaceSpaces && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
	                          </span>
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => setStep2RemoveUrls(prev => !prev)}
	                          className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
	                          step2RemoveUrls ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
	                        }`}
	                        >
	                          <span className="min-w-0 text-sm text-slate-700">删除所有 URL 和电子邮件地址</span>
	                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
	                            step2RemoveUrls ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
	                          }`}>
	                            {step2RemoveUrls && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
	                          </span>
	                        </button>
	                      </div>
	                    </div>

	                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 space-y-5">
	                      <div className="flex items-start gap-3">
	                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
	                          <Database className="w-5 h-5 text-slate-600" />
	                        </div>
	                        <div>
	                          <div className="text-sm font-semibold text-slate-800">索引方式设置</div>
	                          <div className="text-xs text-slate-500 mt-0.5">选择文档入库后的索引与召回策略</div>
	                        </div>
	                      </div>

	                      <div className="grid grid-cols-3 gap-2">
	                        {(['混合检索', '向量检索', '全文检索'] as const).map((method) => (
	                          <button
	                            key={method}
	                            onClick={() => setStep2IndexMethod(method)}
	                            className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
	                              step2IndexMethod === method
	                                ? 'border-blue-500 bg-blue-50 text-blue-700'
	                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50'
	                            }`}
	                          >
	                            <span className="inline-flex items-center justify-center gap-1.5">
	                              {method}
	                              {method === '混合检索' && (
	                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
	                                  step2IndexMethod === method
	                                    ? 'bg-blue-100 text-blue-700'
	                                    : 'bg-slate-100 text-slate-500'
	                                }`}>
	                                  推荐
	                                </span>
	                              )}
	                            </span>
	                          </button>
	                        ))}
	                      </div>

	                      {step2IndexMethod === '向量检索' && (
	                        <div className="space-y-4 pt-1">
	                          <p className="text-xs leading-5 text-slate-500">
	                            向量检索会将文本片段转换为语义向量，并按语义相似度召回相关内容，适合表达相近但关键词不完全一致的问答场景。
	                          </p>
	                          <div className="grid grid-cols-2 gap-4">
	                          <div>
	                            <div className="flex items-center gap-1.5 mb-2">
	                              <label className="text-xs font-medium text-slate-600">Top K</label>
	                              <div className="relative group">
	                                <span className="w-4 h-4 rounded-full border border-slate-300 text-slate-400 text-[10px] flex items-center justify-center cursor-help">?</span>
	                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-5 text-white shadow-xl z-[9999]">
	                                  向量检索最多召回的候选切块数量。数值越大，召回覆盖更广，但后续排序和响应成本也会增加。
	                                </div>
	                              </div>
	                            </div>
	                            <div className="space-y-2">
	                              <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
	                                <input
	                                  type="number"
	                                  min={1}
	                                  max={10}
	                                  value={step2IndexConfig.vectorTopK}
	                                  onChange={(e) => setStep2IndexConfig(prev => ({ ...prev, vectorTopK: Math.min(10, Math.max(1, parseInt(e.target.value) || 1)) }))}
	                                  className="w-full min-w-0 px-3 py-2 text-sm text-slate-700 focus:outline-none"
	                                />
	                                <div className="flex flex-col border-l border-slate-200">
	                                  <button
	                                    onClick={() => setStep2IndexConfig(prev => ({ ...prev, vectorTopK: Math.min(10, prev.vectorTopK + 1) }))}
	                                    className="px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-50"
	                                  >▲</button>
	                                  <button
	                                    onClick={() => setStep2IndexConfig(prev => ({ ...prev, vectorTopK: Math.max(1, prev.vectorTopK - 1) }))}
	                                    className="border-t border-slate-200 px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-50"
	                                  >▼</button>
	                                </div>
	                              </div>
	                              <input
	                                type="range"
	                                min={1}
	                                max={10}
	                                value={step2IndexConfig.vectorTopK}
	                                onChange={(e) => setStep2IndexConfig(prev => ({ ...prev, vectorTopK: parseInt(e.target.value) }))}
	                                className="w-full accent-blue-600"
	                              />
	                            </div>
	                          </div>
	                          <div>
	                            <div className="flex items-center gap-1.5 mb-2">
	                              <label className="text-xs font-medium text-slate-600">Score 阈值</label>
	                              <div className="relative group">
	                                <span className="w-4 h-4 rounded-full border border-slate-300 text-slate-400 text-[10px] flex items-center justify-center cursor-help">?</span>
	                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-5 text-white shadow-xl z-[9999]">
	                                  用于设置文本片段筛选的相似度阈值。
	                                </div>
	                              </div>
	                            </div>
	                            <div className="space-y-2">
	                              <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
	                                <input
	                                  type="number"
	                                  min={0}
	                                  max={1}
	                                  step="0.05"
	                                  value={step2IndexConfig.similarityThreshold}
	                                  onChange={(e) => setStep2IndexConfig(prev => ({ ...prev, similarityThreshold: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)) }))}
	                                  className="w-full min-w-0 px-3 py-2 text-sm text-slate-700 focus:outline-none"
	                                />
	                                <div className="flex flex-col border-l border-slate-200">
	                                  <button
	                                    onClick={() => setStep2IndexConfig(prev => ({ ...prev, similarityThreshold: Math.min(1, Number((prev.similarityThreshold + 0.05).toFixed(2))) }))}
	                                    className="px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-50"
	                                  >▲</button>
	                                  <button
	                                    onClick={() => setStep2IndexConfig(prev => ({ ...prev, similarityThreshold: Math.max(0, Number((prev.similarityThreshold - 0.05).toFixed(2))) }))}
	                                    className="border-t border-slate-200 px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-50"
	                                  >▼</button>
	                                </div>
	                              </div>
	                              <input
	                                type="range"
	                                min={0}
	                                max={1}
	                                step="0.05"
	                                value={step2IndexConfig.similarityThreshold}
	                                onChange={(e) => setStep2IndexConfig(prev => ({ ...prev, similarityThreshold: parseFloat(e.target.value) }))}
	                                className="w-full accent-blue-600"
	                              />
	                            </div>
	                          </div>
	                          </div>
	                        </div>
	                      )}

	                      {step2IndexMethod === '全文检索' && (
	                        <div className="space-y-4 pt-1">
	                          <p className="text-xs leading-5 text-slate-500">
	                            全文检索会基于关键词和文本匹配关系召回相关片段，适合术语、编号、人名、产品名等需要精确命中的检索场景。
	                          </p>
	                          <div className="grid grid-cols-2 gap-4">
	                            <div className="min-w-0">
	                              <label className="text-xs font-medium text-slate-600 mb-2 block">关键词召回数量</label>
	                              <div className="space-y-2">
	                                <div className="flex h-10 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
	                                  <input
	                                    type="number"
	                                    min={1}
	                                    max={10}
	                                    value={step2IndexConfig.fullTextTopK}
	                                    onChange={(e) => {
	                                      const nextValue = Math.min(10, Math.max(1, parseInt(e.target.value) || 1));
	                                      setStep2IndexConfig(prev => ({ ...prev, fullTextTopK: nextValue }));
	                                    }}
	                                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none"
	                                  />
	                                  <div className="flex w-8 flex-col border-l border-slate-200 bg-white/70">
	                                    <button
	                                      type="button"
	                                      onClick={() => setStep2IndexConfig(prev => ({ ...prev, fullTextTopK: Math.min(10, prev.fullTextTopK + 1) }))}
	                                      className="flex h-1/2 items-center justify-center text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
	                                    >
	                                      ▲
	                                    </button>
	                                    <button
	                                      type="button"
	                                      onClick={() => setStep2IndexConfig(prev => ({ ...prev, fullTextTopK: Math.max(1, prev.fullTextTopK - 1) }))}
	                                      className="flex h-1/2 items-center justify-center border-t border-slate-200 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
	                                    >
	                                      ▼
	                                    </button>
	                                  </div>
	                                </div>
	                                <input
	                                  type="range"
	                                  min={1}
	                                  max={10}
	                                  value={step2IndexConfig.fullTextTopK}
	                                  onChange={(e) => setStep2IndexConfig(prev => ({ ...prev, fullTextTopK: parseInt(e.target.value) }))}
	                                  className="w-full accent-blue-600"
	                                />
	                              </div>
	                            </div>
	                            <div className="min-w-0">
	                              <label className="text-xs font-medium text-slate-600 mb-2 block">关键词权重</label>
	                              <div className="space-y-2">
	                                <div className="flex h-10 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
	                                  <input
	                                    type="number"
	                                    min={0.1}
	                                    max={1}
	                                    step="0.1"
	                                    value={step2IndexConfig.keywordBoost}
	                                    onChange={(e) => {
	                                      const nextValue = Math.min(1, Math.max(0.1, parseFloat(e.target.value) || 0.1));
	                                      setStep2IndexConfig(prev => ({ ...prev, keywordBoost: Number(nextValue.toFixed(1)) }));
	                                    }}
	                                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none"
	                                  />
	                                  <div className="flex w-8 flex-col border-l border-slate-200 bg-white/70">
	                                    <button
	                                      type="button"
	                                      onClick={() => setStep2IndexConfig(prev => ({ ...prev, keywordBoost: Number(Math.min(1, prev.keywordBoost + 0.1).toFixed(1)) }))}
	                                      className="flex h-1/2 items-center justify-center text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
	                                    >
	                                      ▲
	                                    </button>
	                                    <button
	                                      type="button"
	                                      onClick={() => setStep2IndexConfig(prev => ({ ...prev, keywordBoost: Number(Math.max(0.1, prev.keywordBoost - 0.1).toFixed(1)) }))}
	                                      className="flex h-1/2 items-center justify-center border-t border-slate-200 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600"
	                                    >
	                                      ▼
	                                    </button>
	                                  </div>
	                                </div>
	                                <input
	                                  type="range"
	                                  min={0.1}
	                                  max={1}
	                                  step="0.1"
	                                  value={step2IndexConfig.keywordBoost}
	                                  onChange={(e) => setStep2IndexConfig(prev => ({ ...prev, keywordBoost: parseFloat(e.target.value) }))}
	                                  className="w-full accent-blue-600"
	                                />
	                              </div>
	                            </div>
	                          </div>
	                        </div>
	                      )}

	                      {step2IndexMethod === '混合检索' && (
	                        <div className="space-y-4 pt-1">
	                          <p className="text-xs leading-5 text-slate-500">
	                            混合检索会同时结合语义相似度和关键词匹配结果，兼顾表达相近的召回能力与关键词精确命中的稳定性。
	                          </p>
	                          <div className="space-y-4">
	                            <div className="pt-2">
	                              <input
	                                type="range"
	                                min={0}
	                                max={1}
	                                step="0.1"
	                                value={step2IndexConfig.vectorWeight / 100}
	                                style={{ '--semantic-weight': `${step2IndexConfig.vectorWeight}%` } as CSSProperties}
	                                onChange={(e) => {
	                                  const semanticWeight = Math.round(parseFloat(e.target.value) * 100);
	                                  setStep2IndexConfig(prev => ({
	                                    ...prev,
	                                    vectorWeight: semanticWeight,
	                                    fullTextWeight: 100 - semanticWeight,
	                                  }));
	                                }}
	                                className="semantic-keyword-range"
	                              />
	                            </div>
	                            <div className="flex items-center justify-between text-sm font-semibold">
	                              <span className="text-sky-500">语义 {Number((step2IndexConfig.vectorWeight / 100).toFixed(1))}</span>
	                              <span className="text-teal-500">{Number((step2IndexConfig.fullTextWeight / 100).toFixed(1))} 关键词</span>
	                            </div>
	                          </div>
	                        </div>
	                      )}
	                    </div>
	                  </div>

                  {/* 右侧：文档分块预览 */}
                  <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden flex flex-col bg-white">
                    <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
                      <span className="text-xs text-slate-500 font-medium">{getStep2PreviewLabel()}</span>
                      <div className="relative">
                        <select
                          value={step2PreviewFileIndex}
                          onChange={(e) => { setStep2PreviewFileIndex(parseInt(e.target.value)); setStep2PreviewChunks([]); setStep2ShowPreview(false); }}
                          className="appearance-none pl-7 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer max-w-[240px] truncate"
                        >
                          {uploadingFiles.filter(f => f.status === 'success').map((file, idx) => (
                            <option key={file.id} value={idx}>{file.name}</option>
                          ))}
                          {uploadingFiles.filter(f => f.status === 'success').length === 0 && (
                            <option value={0}>暂无已上传文件</option>
                          )}
                        </select>
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                      <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-500 text-xs font-medium rounded-lg shrink-0">
                        {step2ShowPreview ? step2PreviewChunks.length : 0} {fileUploadFileType === 'table' ? '条记录' : fileUploadFileType === 'image' ? '条问答' : '预估块'}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5">
                      {!step2ShowPreview || step2PreviewChunks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-16">
                          <svg className="w-16 h-16 mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                          </svg>
                          <p className="text-sm text-slate-400">{getStep2PreviewEmptyText()}</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {step2PreviewChunks.map((chunk, idx) => (
                            <div key={chunk.id} className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                                  <span className="text-blue-600 font-bold text-xs">#{idx + 1}</span>
                                </div>
                                <span className="text-xs text-slate-500">{chunk.content.length} 字符</span>
                              </div>
                              <p className="text-xs text-slate-700 leading-relaxed line-clamp-4">{chunk.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>


                  {/* 旧配置区域 - 隐藏 */}
                  <div className="hidden">
                  {/* 二、文件解析配置 */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <span className="text-blue-600 font-bold text-sm">2</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">文件解析配置</h3>
                        <span className="text-xs text-slate-500 ml-2">配置文档切片策略</span>
                      </div>
                      <button
                        onClick={() => {
                          setFileParseConfig({
                            sliceMethod: 'smart',
                            smartMaxLength: 800,
                            smartOverlap: 100,
                            lengthMaxSize: 800,
                            lengthOverlap: 100,
                            regexPattern: '\\n\\n',
                            regexMaxLength: 1000,
                            pagesPerChunk: 1,
                            mergeShortPages: true,
                            titleLevel: 1,
                            titleMaxLength: 1000,
                            customSeparator: '。',
                            customKeepSeparator: false,
                            customMaxLength: 800
                          });
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>重置</span>
                      </button>
                    </div>

                    {/* 左右布局：左边配置，右边预览 */}
                    <div className="flex gap-6">
                      {/* 左侧：配置区域 */}
                      <div className="flex-1 space-y-6">
                        {/* 切片方式选择 */}
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <label className="text-sm font-semibold text-slate-700">选择切片方式</label>
                            <span className="text-red-500 text-sm">*</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                          {[
                            { value: 'smart', icon: Sparkles, label: '智能切片', desc: '推荐', badge: true },
                            { value: 'length', icon: Hash, label: '长度切片', desc: '按字符数' },
                            { value: 'regex', icon: Regex, label: '正则切片', desc: '自定义规则' },
                            { value: 'page', icon: FileStack, label: '按页切片', desc: '适合PDF' },
                            { value: 'title', icon: Type, label: '按标题切片', desc: '结构化文档' },
                            { value: 'custom', icon: Scissors, label: '自定义切片', desc: '灵活配置' }
                          ].map((method) => (
                            <button
                              key={method.value}
                              onClick={() => setFileParseConfig({...fileParseConfig, sliceMethod: method.value as any})}
                              className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                fileParseConfig.sliceMethod === method.value
                                  ? 'border-blue-500 bg-blue-50 shadow-md'
                                  : 'border-slate-200 hover:border-blue-300 bg-white'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  fileParseConfig.sliceMethod === method.value ? 'bg-blue-100' : 'bg-slate-100'
                                }`}>
                                  <method.icon className={`w-4 h-4 ${
                                    fileParseConfig.sliceMethod === method.value ? 'text-blue-600' : 'text-slate-600'
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-slate-800 text-sm mb-0.5">{method.label}</div>
                                  <div className="text-xs text-slate-500">{method.desc}</div>
                                </div>
                              </div>
                              {method.badge && (
                                <div className="absolute top-2 right-2 px-2 py-0.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-bold rounded-full">
                                  推荐
                                </div>
                              )}
                              {fileParseConfig.sliceMethod === method.value && (
                                <div className="absolute bottom-2 right-2 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 配置项 - 根据不同切片方式显示不同配置 */}
                      <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                        <h4 className="text-sm font-semibold text-slate-700 mb-4">切片参数配置</h4>
                        
                        {/* 智能切片配置 */}
                        {fileParseConfig.sliceMethod === 'smart' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <label className="text-sm text-slate-700 font-medium">最大切片长度</label>
                                  <button className="group relative">
                                    <span className="text-slate-400 hover:text-blue-600 cursor-help">ⓘ</span>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-10">
                                      每个文本块的最大字符数。智能切片会在语义完整的位置切分，不会强制截断句子。
                                    </div>
                                  </button>
                                </div>
                                <input
                                  type="number"
                                  value={fileParseConfig.smartMaxLength}
                                  onChange={(e) => setFileParseConfig({...fileParseConfig, smartMaxLength: parseInt(e.target.value) || 800})}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                  placeholder="800"
                                />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <label className="text-sm text-slate-700 font-medium">重叠长度</label>
                                  <button className="group relative">
                                    <span className="text-slate-400 hover:text-blue-600 cursor-help">ⓘ</span>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-10">
                                      相邻文本块之间重复的字符数，用于保持上下文连贯性。
                                    </div>
                                  </button>
                                </div>
                                <input
                                  type="number"
                                  value={fileParseConfig.smartOverlap}
                                  onChange={(e) => setFileParseConfig({...fileParseConfig, smartOverlap: parseInt(e.target.value) || 100})}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                  placeholder="100"
                                />
                              </div>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <p className="text-xs text-blue-700">
                                <strong>智能切片说明：</strong>系统会自动识别文档结构，在段落、句子等语义完整的位置进行切分，确保每个文本块都包含完整的语义信息。
                              </p>
                            </div>
                          </div>
                        )}

                        {/* 长度切片配置 */}
                        {fileParseConfig.sliceMethod === 'length' && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm text-slate-700 font-medium mb-2 block">默认切片大小</label>
                                <input
                                  type="number"
                                  value={fileParseConfig.lengthMaxSize}
                                  onChange={(e) => setFileParseConfig({...fileParseConfig, lengthMaxSize: parseInt(e.target.value) || 800})}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                  placeholder="800"
                                />
                              </div>
                              <div>
                                <label className="text-sm text-slate-700 font-medium mb-2 block">默认重叠长度</label>
                                <input
                                  type="number"
                                  value={fileParseConfig.lengthOverlap}
                                  onChange={(e) => setFileParseConfig({...fileParseConfig, lengthOverlap: parseInt(e.target.value) || 100})}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                  placeholder="100"
                                />
                              </div>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <p className="text-xs text-amber-700">
                                <strong>长度切片说明：</strong>按固定字符数进行切分，可能会在句子中间截断。适合对文本结构要求不高的场景。
                              </p>
                            </div>
                          </div>
                        )}

                        {/* 正则切片配置 */}
                        {fileParseConfig.sliceMethod === 'regex' && (
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm text-slate-700 font-medium mb-2 block">正则表达式</label>
                              <input
                                type="text"
                                value={fileParseConfig.regexPattern}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, regexPattern: e.target.value})}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-mono"
                                placeholder="\\n\\n"
                              />
                              <p className="text-xs text-slate-500 mt-1">例如：\\n\\n（双换行）或 \\n#{'{1,3}'}\\s（Markdown标题）</p>
                            </div>
                            <div>
                              <label className="text-sm text-slate-700 font-medium mb-2 block">最大切片长度</label>
                              <input
                                type="number"
                                value={fileParseConfig.regexMaxLength}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, regexMaxLength: parseInt(e.target.value) || 1000})}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                placeholder="1000"
                              />
                            </div>
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                              <p className="text-xs text-purple-700">
                                <strong>正则切片说明：</strong>使用自定义正则表达式匹配切分点，适合有特定格式要求的文档。
                              </p>
                            </div>
                          </div>
                        )}

                        {/* 按页切片配置 */}
                        {fileParseConfig.sliceMethod === 'page' && (
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm text-slate-700 font-medium mb-2 block">每个切片包含页数</label>
                              <input
                                type="number"
                                min="1"
                                value={fileParseConfig.pagesPerChunk}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, pagesPerChunk: parseInt(e.target.value) || 1})}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                placeholder="1"
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id="mergeShortPages"
                                checked={fileParseConfig.mergeShortPages}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, mergeShortPages: e.target.checked})}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              />
                              <label htmlFor="mergeShortPages" className="text-sm text-slate-700">
                                合并内容较少的页面
                              </label>
                            </div>
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <p className="text-xs text-green-700">
                                <strong>按页切片说明：</strong>按PDF页面进行切分，保持页面完整性。适合PDF文档。
                              </p>
                            </div>
                          </div>
                        )}

                        {/* 按标题切片配置 */}
                        {fileParseConfig.sliceMethod === 'title' && (
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm text-slate-700 font-medium mb-2 block">标题级别</label>
                              <select
                                value={fileParseConfig.titleLevel}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, titleLevel: parseInt(e.target.value)})}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                              >
                                <option value="1">H1 - 一级标题</option>
                                <option value="2">H2 - 二级标题</option>
                                <option value="3">H3 - 三级标题</option>
                                <option value="4">H4 - 四级标题</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-sm text-slate-700 font-medium mb-2 block">最大切片长度</label>
                              <input
                                type="number"
                                value={fileParseConfig.titleMaxLength}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, titleMaxLength: parseInt(e.target.value) || 1000})}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                placeholder="1000"
                              />
                            </div>
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                              <p className="text-xs text-indigo-700">
                                <strong>按标题切片说明：</strong>根据文档标题层级进行切分，保持章节完整性。适合结构化文档。
                              </p>
                            </div>
                          </div>
                        )}

                        {/* 自定义切片配置 */}
                        {fileParseConfig.sliceMethod === 'custom' && (
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm text-slate-700 font-medium mb-2 block">分隔符</label>
                              <input
                                type="text"
                                value={fileParseConfig.customSeparator}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, customSeparator: e.target.value})}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                placeholder="。"
                              />
                              <p className="text-xs text-slate-500 mt-1">例如：。（句号）、\n（换行）、；（分号）</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id="keepSeparator"
                                checked={fileParseConfig.customKeepSeparator}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, customKeepSeparator: e.target.checked})}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              />
                              <label htmlFor="keepSeparator" className="text-sm text-slate-700">
                                保留分隔符
                              </label>
                            </div>
                            <div>
                              <label className="text-sm text-slate-700 font-medium mb-2 block">最大切片长度</label>
                              <input
                                type="number"
                                value={fileParseConfig.customMaxLength}
                                onChange={(e) => setFileParseConfig({...fileParseConfig, customMaxLength: parseInt(e.target.value) || 800})}
                                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                placeholder="800"
                              />
                            </div>
                            <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
                              <p className="text-xs text-pink-700">
                                <strong>自定义切片说明：</strong>使用自定义分隔符进行切分，灵活适配各种文档格式。
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                        </div>

                      {/* 右侧：切片预览区域 */}
                      <div className="w-96 shrink-0">
                        <div className="sticky top-8">
                          <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-2xl border-2 border-slate-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-sm font-bold text-slate-800">切片预览</h4>
                              <button
                                onClick={() => {
                                  // 生成模拟预览数据
                                  const mockData = [
                                    { id: '1', content: '这是第一个文本切片的内容示例。根据您选择的切片方式，文档会被分割成多个独立的文本块。', charCount: 52 },
                                    { id: '2', content: '这是第二个文本切片的内容示例。切片的大小和重叠程度会影响检索的准确性和效率。', charCount: 45 },
                                    { id: '3', content: '这是第三个文本切片的内容示例。不同的文档类型适合不同的切片策略。', charCount: 38 }
                                  ];
                                  setSlicePreviewData(mockData);
                                  setShowSlicePreview(true);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-all"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>生成预览</span>
                              </button>
                            </div>

                            {slicePreviewData.length > 0 ? (
                              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                                {slicePreviewData.map((slice, index) => (
                                  <div
                                    key={slice.id}
                                    className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 transition-all"
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <span className="text-blue-600 font-bold text-xs">#{index + 1}</span>
                                      </div>
                                      <span className="text-xs text-slate-500">{slice.charCount} 字符</span>
                                    </div>
                                    <p className="text-xs text-slate-700 leading-relaxed line-clamp-4">
                                      {slice.content}
                                    </p>
                                  </div>
                                ))}
                                <div className="pt-3 border-t border-slate-200">
                                  <div className="grid grid-cols-2 gap-2 text-center">
                                    <div className="bg-blue-50 rounded-lg p-2">
                                      <p className="text-xs text-blue-600 font-medium">总切片</p>
                                      <p className="text-lg font-bold text-blue-900">{slicePreviewData.length}</p>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-2">
                                      <p className="text-xs text-green-600 font-medium">平均字符</p>
                                      <p className="text-lg font-bold text-green-900">
                                        {Math.round(slicePreviewData.reduce((sum, s) => sum + s.charCount, 0) / slicePreviewData.length)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-12">
                                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                  <Eye className="w-8 h-8 text-slate-400" />
                                </div>
                                <p className="text-sm text-slate-500 mb-1">暂无预览</p>
                                <p className="text-xs text-slate-400">点击"生成预览"查看切片效果</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 三、OCR配置 */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-sm">3</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800">OCR配置</h3>
                      <span className="text-xs text-slate-500 ml-2">识别扫描件与图片中的文字</span>
                    </div>

                    {/* OCR推荐提示 */}
                    {showOcrRecommendation && (
                      <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-bold text-blue-900 mb-1">检测到当前文件可能需要OCR识别</h4>
                            <p className="text-xs text-blue-700 mb-3">
                              系统检测到扫描版PDF或图片文档，建议开启OCR识别以提取文字内容，提升知识检索准确率。
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setOcrConfig({...ocrConfig, enabled: true});
                                  setShowOcrRecommendation(false);
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-all"
                              >
                                开启OCR识别
                              </button>
                              <button
                                onClick={() => setShowOcrRecommendation(false)}
                                className="px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-50 transition-all"
                              >
                                暂不开启
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowOcrRecommendation(false)}
                            className="text-blue-400 hover:text-blue-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-6">
                      {/* OCR开关 */}
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-300 transition-all group">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                            ocrConfig.enabled ? 'bg-blue-100' : 'bg-slate-200'
                          }`}>
                            <Eye className={`w-6 h-6 ${ocrConfig.enabled ? 'text-blue-600' : 'text-slate-500'}`} />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-800 mb-1">OCR识别</h4>
                            <p className="text-xs text-slate-500">用于识别扫描件与图片中的文字内容，提升知识检索准确率</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ocrConfig.enabled}
                            onChange={(e) => setOcrConfig({...ocrConfig, enabled: e.target.checked})}
                            className="sr-only peer"
                          />
                          <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      {/* OCR详细配置 */}
                      {ocrConfig.enabled && (
                        <div className="space-y-4 pl-4 border-l-2 border-blue-200">
                          {/* 扫描PDF识别 */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id="scanPdfRecognition"
                                checked={ocrConfig.scanPdfRecognition}
                                onChange={(e) => setOcrConfig({...ocrConfig, scanPdfRecognition: e.target.checked})}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              />
                              <label htmlFor="scanPdfRecognition" className="text-sm text-slate-700 font-medium">
                                扫描PDF识别
                              </label>
                            </div>
                          </div>

                          {/* OCR语言选择 */}
                          <div>
                            <label className="text-sm text-slate-700 font-medium mb-2 block">OCR识别语言</label>
                            <select
                              value={ocrConfig.language}
                              onChange={(e) => setOcrConfig({...ocrConfig, language: e.target.value as any})}
                              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            >
                              <option value="auto">自动检测</option>
                              <option value="zh-CN">简体中文</option>
                              <option value="en-US">英语</option>
                              <option value="ja-JP">日语</option>
                              <option value="ko-KR">韩语</option>
                            </select>
                          </div>

                          {/* OCR状态提示 */}
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                              <p className="text-xs text-green-700 font-medium">OCR识别已启用，将自动处理扫描件和图片文档</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 四、Metadata配置 */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-sm">4</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800">Metadata配置</h3>
                      <span className="text-xs text-slate-500 ml-2">为文档添加元数据标签</span>
                    </div>

                    <div className="space-y-6">
                      {/* 已有的metadata */}
                      <div className="space-y-3">
                        {metadataConfig.map((item, index) => (
                          <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-all group">
                            <input
                              type="text"
                              value={item.key}
                              onChange={(e) => {
                                const newConfig = [...metadataConfig];
                                newConfig[index].key = e.target.value;
                                setMetadataConfig(newConfig);
                              }}
                              placeholder="键名"
                              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            />
                            <span className="text-slate-400">=</span>
                            <input
                              type="text"
                              value={item.value}
                              onChange={(e) => {
                                const newConfig = [...metadataConfig];
                                newConfig[index].value = e.target.value;
                                setMetadataConfig(newConfig);
                              }}
                              placeholder="值"
                              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            />
                            <button
                              onClick={() => {
                                const newConfig = metadataConfig.filter((_, i) => i !== index);
                                setMetadataConfig(newConfig);
                              }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* 添加新metadata */}
                      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-dashed border-blue-300">
                        <input
                          type="text"
                          value={metadataInput.key}
                          onChange={(e) => setMetadataInput({...metadataInput, key: e.target.value})}
                          placeholder="键名（如：version）"
                          className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                        />
                        <span className="text-blue-400">=</span>
                        <input
                          type="text"
                          value={metadataInput.value}
                          onChange={(e) => setMetadataInput({...metadataInput, value: e.target.value})}
                          placeholder="值（如：v1.0）"
                          className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                        />
                        <button
                          onClick={() => {
                            if (metadataInput.key && metadataInput.value) {
                              setMetadataConfig([...metadataConfig, {...metadataInput}]);
                              setMetadataInput({ key: '', value: '' });
                            }
                          }}
                          disabled={!metadataInput.key || !metadataInput.value}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          添加
                        </button>
                      </div>

                      {/* 常用字段推荐 */}
                      <div>
                        <p className="text-xs text-slate-500 mb-2">常用字段推荐：</p>
                        <div className="flex flex-wrap gap-2">
                          {['source', 'author', 'department', 'tag', 'version', 'category', 'priority'].map((field) => (
                            <button
                              key={field}
                              onClick={() => {
                                if (!metadataConfig.find(m => m.key === field)) {
                                  setMetadataConfig([...metadataConfig, { key: field, value: '' }]);
                                }
                              }}
                              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                            >
                              + {field}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 分类预览 */}
                      {metadataConfig.some(m => m.value) && (
                        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
                          <h4 className="text-sm font-semibold text-purple-900 mb-2">该文件将如何被分类与检索：</h4>
                          <div className="flex flex-wrap gap-2">
                            {metadataConfig.filter(m => m.value).map((item, index) => (
                              <span key={index} className="px-3 py-1 bg-white border border-purple-200 text-purple-700 rounded-lg text-xs font-medium">
                                {item.key}: {item.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 五、文本增强处理 */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-sm">5</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800">文本增强处理</h3>
                      <span className="text-xs text-slate-500 ml-2">优化文档解析质量</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Markdown结构保留 */}
                      <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        textEnhanceConfig.preserveMarkdown 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-slate-200 hover:border-blue-300 bg-white'
                      }`}
                        onClick={() => setTextEnhanceConfig({...textEnhanceConfig, preserveMarkdown: !textEnhanceConfig.preserveMarkdown})}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            textEnhanceConfig.preserveMarkdown ? 'bg-blue-100' : 'bg-slate-100'
                          }`}>
                            <Hash className={`w-4 h-4 ${textEnhanceConfig.preserveMarkdown ? 'text-blue-600' : 'text-slate-500'}`} />
                          </div>
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            textEnhanceConfig.preserveMarkdown ? 'bg-blue-600' : 'bg-slate-200'
                          }`}>
                            {textEnhanceConfig.preserveMarkdown && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-1">Markdown结构保留</h4>
                        <p className="text-xs text-slate-500">保留标题、列表等结构化信息</p>
                      </div>

                      {/* 表格增强解析 */}
                      <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        textEnhanceConfig.enhanceTable 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-slate-200 hover:border-blue-300 bg-white'
                      }`}
                        onClick={() => setTextEnhanceConfig({...textEnhanceConfig, enhanceTable: !textEnhanceConfig.enhanceTable})}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            textEnhanceConfig.enhanceTable ? 'bg-blue-100' : 'bg-slate-100'
                          }`}>
                            <FileStack className={`w-4 h-4 ${textEnhanceConfig.enhanceTable ? 'text-blue-600' : 'text-slate-500'}`} />
                          </div>
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            textEnhanceConfig.enhanceTable ? 'bg-blue-600' : 'bg-slate-200'
                          }`}>
                            {textEnhanceConfig.enhanceTable && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-1">表格增强解析</h4>
                        <p className="text-xs text-slate-500">智能识别并保留表格结构</p>
                      </div>

                      {/* 去页眉页脚 */}
                      <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        textEnhanceConfig.removeHeaderFooter 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-slate-200 hover:border-blue-300 bg-white'
                      }`}
                        onClick={() => setTextEnhanceConfig({...textEnhanceConfig, removeHeaderFooter: !textEnhanceConfig.removeHeaderFooter})}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            textEnhanceConfig.removeHeaderFooter ? 'bg-blue-100' : 'bg-slate-100'
                          }`}>
                            <Scissors className={`w-4 h-4 ${textEnhanceConfig.removeHeaderFooter ? 'text-blue-600' : 'text-slate-500'}`} />
                          </div>
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            textEnhanceConfig.removeHeaderFooter ? 'bg-blue-600' : 'bg-slate-200'
                          }`}>
                            {textEnhanceConfig.removeHeaderFooter && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-1">去页眉页脚</h4>
                        <p className="text-xs text-slate-500">自动移除重复的页眉页脚内容</p>
                      </div>

                      {/* 图片文本提取 */}
                      <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        textEnhanceConfig.extractImageText 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-slate-200 hover:border-blue-300 bg-white'
                      }`}
                        onClick={() => setTextEnhanceConfig({...textEnhanceConfig, extractImageText: !textEnhanceConfig.extractImageText})}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            textEnhanceConfig.extractImageText ? 'bg-blue-100' : 'bg-slate-100'
                          }`}>
                            <Image className={`w-4 h-4 ${textEnhanceConfig.extractImageText ? 'text-blue-600' : 'text-slate-500'}`} />
                          </div>
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            textEnhanceConfig.extractImageText ? 'bg-blue-600' : 'bg-slate-200'
                          }`}>
                            {textEnhanceConfig.extractImageText && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-1">图片文本提取</h4>
                        <p className="text-xs text-slate-500">提取图片中的文字信息</p>
                      </div>
                    </div>
                  </div>
                  </div>{/* 旧配置区域结束 */}

                </div>
              </div>
              )}
            
              {/* Step 3: 处理并完成 */}
              {fileUploadStep === 3 && (
                <div className="flex-1 overflow-y-auto px-8 py-8 pb-28 bg-[#fcfdfe]">
                  <div className="max-w-5xl mx-auto space-y-5">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex items-start gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                            importStatus === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                          }`}>
                            {importStatus === 'success' ? <Check className="w-6 h-6" /> : <Upload className="w-6 h-6 animate-pulse" />}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-800">
                              {importStatus === 'success' ? '处理完成' : '正在处理文件'}
                            </h3>
                            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                              {importStatus !== 'success' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                              <span>{getStageSummary()}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`mt-6 grid gap-3 ${skipUploadRuleConfig ? 'grid-cols-1' : 'grid-cols-3'}`}>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                          {(() => {
                            const ruleSummary = getStep3RuleSummary();
                            return (
                              <>
                                <div className="text-xs text-slate-400 mb-2">{ruleSummary.label}</div>
                                <div className="text-sm font-semibold text-slate-700">{ruleSummary.title}</div>
                                {ruleSummary.desc && (
                                  <div className="text-xs text-slate-500 mt-1">{ruleSummary.desc}</div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        {!skipUploadRuleConfig && (
                          <>
	                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
	                          <div className="text-xs text-slate-400 mb-2">索引方式</div>
	                          <div className="text-sm font-semibold text-slate-700">{step2IndexMethod}</div>
	                          <div className="text-xs text-slate-500 mt-1">
	                            {step2IndexMethod === '向量检索' && `Top K ${step2IndexConfig.vectorTopK} / Score ${step2IndexConfig.similarityThreshold}`}
	                            {step2IndexMethod === '全文检索' && `召回 ${step2IndexConfig.fullTextTopK} / 权重 ${step2IndexConfig.keywordBoost}`}
	                            {step2IndexMethod === '混合检索' && `语义 ${Number((step2IndexConfig.vectorWeight / 100).toFixed(1))} / 关键词 ${Number((step2IndexConfig.fullTextWeight / 100).toFixed(1))}`}
	                          </div>
	                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                          <div className="text-xs text-slate-400 mb-2">检索设置</div>
                          <div className="text-sm font-semibold text-slate-700">混合检索</div>
                          <div className="text-xs text-slate-500 mt-1">标签参与召回 / 语义优先排序</div>
                        </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">文件处理进度</h4>
                          <p className="text-xs text-slate-400 mt-1">展示文件名称、实时状态和索引进度</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-medium">
                          {uploadingFiles.filter(file => file.status === 'success').length} 个文件
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {uploadingFiles.filter(file => file.status === 'success').map((file) => {
                          const progress = importStatus === 'success' ? 100 : (processingFileProgress[file.id] || 0);
                          const previewEntries = createStep2PreviewEntries(file);
                          const audioSegments = file.sourceType === 'audio'
                            ? getAudioTranscriptSegments({
                                name: file.name,
                                content: file.content,
                                asrText: file.asrText,
                                asrSegments: file.asrSegments
                              })
                            : [];
                          const parsedCharCount = file.sourceType === 'audio'
                            ? audioSegments.reduce((sum, segment) => sum + segment.text.length, 0)
                            : previewEntries.reduce((sum, entry) => sum + entry.content.length, 0);
                          const parsedChunkCount = file.sourceType === 'audio' ? audioSegments.length : previewEntries.length;
                          const fileMetricText = file.sourceType === 'audio' && file.asrStatus === 'processing'
                            ? '上传完成 · ASR 转写中...'
                            : file.sourceType === 'audio' && file.asrStatus === 'failed'
                              ? '上传完成 · ASR 未生成真实文本'
                              : `${getFileProcessingStatus(progress)} · ${parsedChunkCount} 个切片 · ${parsedCharCount} 字符`;
                          return (
                            <div key={file.id} className="px-6 py-4">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-800 truncate">{file.name}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                      {fileMetricText}
                                    </div>
                                  </div>
                                </div>
                                <div className="w-64 shrink-0">
                                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                                    <span>{progress >= 100 ? '完成' : '处理中'}</span>
                                    <span className="font-semibold text-slate-700">{progress}%</span>
                                  </div>
                                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            
              {/* 固定底部操作栏 */}
              <div className={`fixed bottom-0 right-0 bg-white border-t border-slate-200 px-8 py-4 flex items-center ${fileUploadStep === 3 ? 'justify-end' : 'justify-between'} z-30 shadow-lg transition-all ${isSidebarCollapsed ? 'left-20' : 'left-64'}`}>
                {fileUploadStep !== 3 && (
                  <button
                    onClick={() => {
                      const hasContent = uploadingFiles.length > 0 || webAddedUrls.length > 0 || fileUploadTags.length > 0;
                      if (hasContent) { setShowFileUploadExitModal(true); }
                      else { setShowFileUploadPage(false); setUploadingFiles([]); setFileUploadStep(1); }
                    }}
                    className="px-6 py-2.5 text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
                  >
                    取消
                  </button>
                )}
                {/* Step 1 下一步 */}
                {fileUploadStep === 1 && (
                  <button
                    disabled={
                      fileUploadFileType === 'web'
                        ? webAddedUrls.length === 0 ||
                          uploadingFiles.some(f => f.status === 'uploading') ||
                          uploadingFiles.some(f => f.status === 'error')
                        : uploadingFiles.length === 0 ||
                          uploadingFiles.some(f => f.status === 'uploading') ||
                          uploadingFiles.some(f => f.status === 'error') ||
                          uploadingFiles.some(f => f.sourceType === 'audio' && !isAudioUploadReady(f))
                    }
                    onClick={() => {
                      if (skipUploadRuleConfig) {
                        startFileImport();
                        return;
                      }
                      setFileUploadStep(2);
                    }}
                    className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <span>下一步</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {/* Step 2 上一步 + 下一步 */}
                {fileUploadStep === 2 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setFileUploadStep(1)}
                      className="px-6 py-2.5 text-slate-600 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
                    >
                      上一步
                    </button>
                    <button
                      onClick={startFileImport}
                      className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                    >
                      <span>下一步</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {/* Step 3 前往文档 */}
                {fileUploadStep === 3 && (
                  <button
                    onClick={goToUploadedDocuments}
                    className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                  >
                    <span>前往文档</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            // 文档列表页面
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* 可滚动内容区域 */}
            <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-[#fcfdfe]">
            <div className="max-w-[1600px] space-y-6">
              {/* 返回按钮和标题 */}
              <div className="mb-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setSelectedKB(null)}
                      className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        selectedKB.type === 'PDF' ? 'bg-blue-50 text-blue-600' :
                        selectedKB.type === 'Website' ? 'bg-emerald-50 text-emerald-600' :
                        selectedKB.type === 'Text' ? 'bg-indigo-50 text-indigo-600' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {selectedKB.type === 'PDF' && <FileText className="w-4 h-4" />}
                        {selectedKB.type === 'Website' && <Globe className="w-4 h-4" />}
                        {selectedKB.type === 'Text' && <FileText className="w-4 h-4" />}
                        {selectedKB.type === 'Files' && <FileStack className="w-4 h-4" />}
                      </div>
                      <h2 className="text-2xl font-bold text-slate-800">{selectedKB.name}</h2>
                      {selectedKB.permissionType === '私有知识库' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 text-xs font-semibold">
                          <Lock className="w-3.5 h-3.5" />
                          私密
                        </span>
                      )}
	                      <button 
	                        onClick={(e) => {
	                          e.stopPropagation();
	                          toggleFavorite(selectedKB.id);
	                        }}
	                        className={`p-1.5 rounded-lg border transition-colors ${
	                          selectedKB.isFavorited
	                            ? 'bg-yellow-50 border-yellow-200 text-yellow-500 hover:bg-yellow-100'
	                            : 'bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100 hover:text-slate-400'
	                        }`}
	                        title={selectedKB.isFavorited ? '取消关注' : '关注'}
	                      >
	                        <Star className={`w-4 h-4 ${selectedKB.isFavorited ? 'fill-yellow-400' : ''}`} />
	                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpenId(dropdownOpenId === `${selectedKB.id}-detail-more` ? null : `${selectedKB.id}-detail-more`);
                      }}
                      className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600"
                      title="更多操作"
                      aria-label="更多操作"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    <AnimatePresence>
                      {dropdownOpenId === `${selectedKB.id}-detail-more` && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-200/50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleEditKB(selectedKB)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            编辑知识库
                          </button>
                          <button
                            onClick={() => confirmDelete(selectedKB.id)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            删除知识库
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* 知识库ID、更新时间和概述 - 放在一行 */}
                <div className="ml-14 mt-2 flex items-center gap-3 text-xs text-slate-400">
                  <span>知识库ID: {selectedKB.id}</span>
                  <span>•</span>
                  <span>更新时间: {selectedKB.lastModified}</span>
                  {selectedKB.description && (
                    <>
                      <span>•</span>
                      <div className="relative group flex items-center">
                        <span className="truncate max-w-[300px]">概述: {selectedKB.description}</span>
                        {/* 悬停显示完整概述 */}
                        {selectedKB.description.length > 40 && (
                          <div className="absolute left-0 top-full mt-2 w-96 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                            {selectedKB.description}
                            <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-800 transform rotate-45"></div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 操作栏 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2 flex-wrap">
                  {/* 搜索框 */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索文件名称、标签..."
                      className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-64"
                      value={docSearchQuery}
                      onChange={(e) => setDocSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

	                <div className="flex gap-2">
	                  <button
	                    onClick={() => {
	                      const latestKB = knowledgeBases.find(kb => kb.id === selectedKB.id);
	                      if (latestKB) {
	                        setSelectedKB(latestKB);
	                      }
	                      setSelectedDocs([]);
	                      setDropdownOpenId(null);
	                      setShowStatusDropdown(false);
	                      setShowTagsDropdown(false);
	                      setShowFormatDropdown(false);
	                      setShowSortDropdown(false);
	                      showToast('success', '当前文件列表已刷新');
	                    }}
	                    className="w-10 h-10 inline-flex items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all"
	                    title="刷新当前文件列表"
	                    aria-label="刷新当前文件列表"
	                  >
	                    <RotateCcw className="w-4 h-4" />
	                  </button>
	                  <button 
	                    onClick={() => {
	                      setIsBatchMode(!isBatchMode);
                      setSelectedDocs([]);
                    }}
                    className={`px-4 py-2 border rounded-xl text-sm font-medium transition-all ${
                      isBatchMode
                        ? 'bg-blue-50 border-blue-500 text-blue-600'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {isBatchMode ? '取消批量' : '批量操作'}
                  </button>
	                  <button 
                    onClick={() => setShowFileUploadPage(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
                  >
                    <Upload className="w-4 h-4 inline mr-2" />
                    文件上传
                  </button>
                </div>
              </div>

              {/* 文档列表 */}
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-auto max-h-[calc(100vh-360px)] relative">
                {(selectedKB?.documents || []).length === 0 ? (
                  <div className="min-h-[420px] flex flex-col items-center justify-center px-8 py-14 text-center">
                    <div className="relative mb-6">
                      <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center shadow-sm">
                        <FileStack className="w-14 h-14 text-blue-500" />
                      </div>
                      <div className="absolute -right-3 -bottom-3 w-11 h-11 rounded-2xl bg-white border border-slate-200 shadow-md flex items-center justify-center">
                        <Upload className="w-5 h-5 text-blue-600" />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">暂无文件</h3>
                    <p className="text-sm text-slate-500 mb-6 max-w-md">
                      当前知识库还没有上传文件，上传文件后可在这里查看解析状态、切片数量和文件详情。
                    </p>
                    <button
                      onClick={() => setShowFileUploadPage(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
                    >
                      <Upload className="w-4 h-4" />
                      文件上传
                    </button>
                  </div>
                ) : (
                <div className="min-w-[1580px]">
                {/* 表头 */}
                <div className="sticky top-0 z-40 bg-slate-50/95 rounded-t-lg border-b border-slate-200 px-4 py-3 flex items-center gap-4 text-xs font-semibold text-slate-500 shadow-[0_6px_14px_-14px_rgba(15,23,42,0.7)]">
                  <div className="sticky left-4 z-50 flex items-center gap-3 shrink-0 w-[340px] bg-slate-50/95 pr-4 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)] after:content-[''] after:absolute after:inset-y-0 after:left-full after:w-4 after:bg-slate-50/95">
                    {isBatchMode && (() => {
                      const currentPageDocIds = (selectedKB?.documents || [])
                        .filter(doc => {
                          const matchesSearch = doc.name.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
                            doc.tags.some(tag => tag.toLowerCase().includes(docSearchQuery.toLowerCase()));
                          const matchesStatus = docStatusFilter === 'all' || getMergedDocStatus(doc) === docStatusFilter;
                          const matchesFormat = docFormatFilter.length === 0 || docFormatFilter.some(format => doc.format.toUpperCase() === format.toUpperCase());
                          const matchesTags = selectedTags.length === 0 || selectedTags.some(tag => doc.tags.includes(tag));
                          return matchesSearch && matchesStatus && matchesFormat && matchesTags;
                        })
                        .sort((a, b) => {
                          if (docSortField === 'callCount') {
                            const result = getDocumentCallCount(a) - getDocumentCallCount(b);
                            return docSortDirection === 'asc' ? result : -result;
                          }
                          const result = new Date(a.lastEdited).getTime() - new Date(b.lastEdited).getTime();
                          return docSortDirection === 'asc' ? result : -result;
                        })
                        .slice((docCurrentPage - 1) * docItemsPerPage, docCurrentPage * docItemsPerPage)
                        .map(doc => doc.id);

                      return (
                        <input
                          type="checkbox"
                          checked={currentPageDocIds.length > 0 && currentPageDocIds.every(id => selectedDocs.includes(id))}
                          onChange={(e) => {
                            setSelectedDocs(prev => {
                              const otherPageSelected = prev.filter(id => !currentPageDocIds.includes(id));
                              return e.target.checked ? [...otherPageSelected, ...currentPageDocIds] : otherPageSelected;
                            });
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500 shrink-0 cursor-pointer"
                        />
                      );
                    })()}
                    <span>文件名称/ID</span>
                  </div>
                  
                  {/* 标签列 - 可点击筛选 */}
                  <div className="shrink-0 w-40 relative">
                    <button
                      onClick={() => {
                        if (!showTagsDropdown) {
                          setPendingSelectedTags(selectedTags);
                        }
                        setShowTagsDropdown(!showTagsDropdown);
                      }}
                      className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                    >
                      <span>标签</span>
                      <Filter className={`w-3.5 h-3.5 transition-colors ${selectedTags.length > 0 ? 'text-blue-600 fill-blue-600' : ''}`} />
                    </button>
                    {showTagsDropdown && (
                      <div
                        className="absolute left-0 top-full mt-2 bg-white rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.12)] border border-slate-200/80 w-[200px] z-20 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 选项列表 */}
                        <div className="max-h-[320px] overflow-y-auto py-2">
                          {(() => {
                            const allTags = Array.from(new Set((selectedKB?.documents || []).flatMap(doc => doc.tags)));
                            if (allTags.length === 0) {
                              return (
                                <div className="px-4 py-6 text-center text-xs text-slate-400">暂无可用标签</div>
                              );
                            }
                            return allTags.map((tag) => {
                              const checked = pendingSelectedTags.includes(tag);
                              return (
                                <label
                                  key={tag}
                                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                                >
                                  <span
                                    className={`relative w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                      checked ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
                                    }`}
                                  >
                                    {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setPendingSelectedTags(prev =>
                                        prev.includes(tag)
                                          ? prev.filter(t => t !== tag)
                                          : [...prev, tag]
                                      );
                                    }}
                                    className="sr-only"
                                  />
                                  <span className="text-sm text-slate-700 truncate">{tag}</span>
                                </label>
                              );
                            });
                          })()}
                        </div>
                        {/* 底部按钮 */}
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-slate-100 bg-slate-50/40">
                          <button
                            onClick={() => setPendingSelectedTags([])}
                            className="text-sm text-slate-400 hover:text-slate-600 transition-colors px-2 py-1"
                          >
                            重置
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTags(pendingSelectedTags);
                              setShowTagsDropdown(false);
                            }}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            确定
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
	                  <div className="shrink-0 w-24 text-right">数据量</div>
	                  <div className="shrink-0 w-20 text-center">段落数</div>
	                  <div className="shrink-0 w-20 text-center">大小</div>
	                  <div className="shrink-0 w-24 text-center">
	                    <button
	                      onClick={() => {
	                        if (docSortField === 'callCount') {
	                          setDocSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
	                        } else {
	                          setDocSortField('callCount');
	                          setDocSortDirection('desc');
	                        }
	                      }}
	                      className={`inline-flex items-center justify-center gap-1.5 transition-colors hover:text-blue-600 ${
	                        docSortField === 'callCount' ? 'text-blue-600 font-semibold' : ''
	                      }`}
	                    >
	                      <span>调用次数</span>
	                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${
	                        docSortField === 'callCount' && docSortDirection === 'asc' ? 'rotate-180' : ''
	                      }`} />
	                    </button>
	                  </div>
	                  <div className="shrink-0 w-24 text-center relative">
                    <button
                      onClick={() => setShowFormatDropdown(!showFormatDropdown)}
                      className="flex items-center justify-center gap-1.5 hover:text-blue-600 transition-colors mx-auto"
                    >
                      <span>文件格式</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFormatDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showFormatDropdown && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 p-3 min-w-[160px] max-h-[300px] overflow-y-auto z-10">
                        <div className="text-xs text-slate-500 mb-2">选择格式筛选</div>
                        <div className="space-y-1">
                          {['DOC', 'TXT', 'DOCX', 'PDF', 'PPT', 'PPTX', 'MD'].map((format) => (
                            <button
                              key={format}
                              onClick={() => {
                                setDocFormatFilter(prev => 
                                  prev.includes(format) 
                                    ? prev.filter(f => f !== format)
                                    : [...prev, format]
                                );
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                                docFormatFilter.includes(format)
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {format}
                              {docFormatFilter.includes(format) && <Check className="w-3 h-3 ml-auto" />}
                            </button>
                          ))}
                        </div>
                        {docFormatFilter.length > 0 && (
                          <button
                            onClick={() => {
                              setDocFormatFilter([]);
                              setShowFormatDropdown(false);
                            }}
                            className="w-full mt-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
                          >
                            清除筛选
                          </button>
                        )}
                      </div>
	                    )}
	                  </div>
	                  <div className="shrink-0 w-32 text-right relative">
                    <button
                      onClick={() => setShowSortDropdown(!showSortDropdown)}
                      className="flex items-center gap-1.5 hover:text-blue-600 transition-colors ml-auto"
                    >
                      <span>更新时间</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showSortDropdown && (
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[120px] z-10">
                        <button
                          onClick={() => {
                            setDocSortField('lastEdited');
                            setDocSortDirection('desc');
                            setShowSortDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                            docSortField === 'lastEdited' && docSortDirection === 'desc' ? 'text-blue-600 font-medium bg-blue-50' : 'text-slate-600'
                          }`}
                        >
                          <ChevronDown className="w-3 h-3" />
                          <span>最新</span>
                        </button>
                        <button
                          onClick={() => {
                            setDocSortField('lastEdited');
                            setDocSortDirection('asc');
                            setShowSortDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                            docSortField === 'lastEdited' && docSortDirection === 'asc' ? 'text-blue-600 font-medium bg-blue-50' : 'text-slate-600'
                          }`}
                        >
                          <ChevronRight className="w-3 h-3 rotate-[-90deg]" />
                          <span>最早</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 w-20 text-right">添加人</div>
	                  <div className="sticky right-[112px] z-50 shrink-0 w-24 bg-slate-50/95 text-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] before:content-[''] before:absolute before:inset-y-0 before:right-full before:w-4 before:bg-slate-50/95 after:content-[''] after:absolute after:inset-y-0 after:left-full after:w-4 after:bg-slate-50/95">
	                    <div className="relative">
	                      <button
	                        onClick={() => setShowStatusDropdown(!showStatusDropdown)}
	                        className="flex items-center justify-center gap-1.5 hover:text-blue-600 transition-colors mx-auto"
	                      >
	                        <span>状态</span>
	                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
	                      </button>
	                      {showStatusDropdown && (
	                        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[120px] z-50">
	                          {[
	                            { value: 'all', label: '全部状态', dot: '' },
	                            { value: 'Queued', label: '排队中', dot: 'bg-slate-400' },
	                            { value: 'Processing', label: '处理中', dot: 'bg-blue-500' },
	                            { value: 'Ready', label: '可用', dot: 'bg-emerald-500' },
	                            { value: 'Failed', label: '失败', dot: 'bg-red-500' },
	                            { value: 'Disabled', label: '已禁用', dot: 'bg-slate-300' },
	                          ].map((option) => (
	                            <button
	                              key={option.value}
	                              onClick={() => {
	                                setDocStatusFilter(option.value as typeof docStatusFilter);
	                                setShowStatusDropdown(false);
	                              }}
	                              className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors flex items-center gap-2 ${
	                                docStatusFilter === option.value ? 'font-medium bg-blue-50' : ''
	                              }`}
	                            >
	                              <span className={`w-2 h-2 rounded-full shrink-0 ${option.dot || 'bg-transparent'}`} />
	                              <span className="text-slate-900">{option.label}</span>
	                            </button>
	                          ))}
	                        </div>
	                      )}
	                    </div>
	                  </div>
	                  <div className="sticky right-0 z-50 shrink-0 w-24 bg-slate-50/95 text-center">操作</div>
                </div>

                {/* 文档列表项 */}
                  {(selectedKB?.documents || [])
                    .filter(doc => {
                      const matchesSearch = doc.name.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
                        doc.tags.some(tag => tag.toLowerCase().includes(docSearchQuery.toLowerCase()));
                      const matchesStatus = docStatusFilter === 'all' || getMergedDocStatus(doc) === docStatusFilter;
                      const matchesFormat = docFormatFilter.length === 0 || docFormatFilter.some(format => doc.format.toUpperCase() === format.toUpperCase());
                      const matchesTags = selectedTags.length === 0 || selectedTags.some(tag => doc.tags.includes(tag));
                      return matchesSearch && matchesStatus && matchesFormat && matchesTags;
                    })
                    .sort((a, b) => {
                      if (docSortField === 'callCount') {
                        const result = getDocumentCallCount(a) - getDocumentCallCount(b);
                        return docSortDirection === 'asc' ? result : -result;
                      }
                      const result = new Date(a.lastEdited).getTime() - new Date(b.lastEdited).getTime();
                      return docSortDirection === 'asc' ? result : -result;
                    })
                    .slice((docCurrentPage - 1) * docItemsPerPage, docCurrentPage * docItemsPerPage)
                    .map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => {
                          if (isBatchMode) {
                            setSelectedDocs(prev => 
                              prev.includes(doc.id) 
                                ? prev.filter(id => id !== doc.id)
                                : [...prev, doc.id]
                            );
	                          } else {
	                            // 打开文档详情页
	                            setActiveDocumentChunkId(1);
	                            setExpandedDocumentChunkIds([]);
	                            setShowDocumentChunks(false);
	                            setSelectedDocument(doc);
	                          }
                        }}
	                        className={`group px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer relative flex items-center gap-4 ${
	                          dropdownOpenId === doc.id ? 'z-40' : ''
	                        } ${
	                          isBatchMode && selectedDocs.includes(doc.id)
	                            ? 'bg-blue-50/70'
	                            : 'bg-white hover:bg-slate-50'
	                        }`}
                      >
                        {/* 文件图标、名称和ID（含复选框） */}
                        <div className={`sticky left-4 z-20 flex items-center gap-3 shrink-0 w-[340px] pr-4 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)] after:content-[''] after:absolute after:inset-y-0 after:left-full after:w-4 ${
                          isBatchMode && selectedDocs.includes(doc.id)
                            ? 'bg-blue-50 after:bg-blue-50'
                            : 'bg-white group-hover:bg-slate-50 after:bg-white group-hover:after:bg-slate-50'
                        }`}>
                          {isBatchMode && (
                            <input
                              type="checkbox"
                              checked={selectedDocs.includes(doc.id)}
                              onChange={() => {}}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500 shrink-0"
                            />
                          )}
                          {/* 根据文件格式显示对应图标 */}
                          <div className="shrink-0">
                            {getFileTypeIcon(doc.format)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-sm text-slate-800 truncate">{doc.name}</h3>
                            <div className="text-xs text-slate-400 mt-0.5 truncate">
                              {doc.fileId || `${doc.id.substring(0, 2)}-${doc.id.substring(2, 4)}...`}
                            </div>
                          </div>
                        </div>

                        {/* 标签 - 固定宽度，最多显示2个 */}
                        <div 
                          className="flex items-center gap-1.5 shrink-0 w-40 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (doc.tags.length > 0) {
                              setViewingDocTags(doc);
                              setShowTagViewModal(true);
                            }
                          }}
                          title={doc.tags.length > 2 ? "点击查看所有标签" : ""}
                        >
                          {doc.tags.length > 0 ? (
                            <>
                              {doc.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium flex items-center gap-1 max-w-[80px] truncate"
                                >
                                  <Tag className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{tag}</span>
                                </span>
                              ))}
                              {doc.tags.length > 2 && (
                                <span 
                                  className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold"
                                >
                                  +{doc.tags.length - 2}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-slate-300">无标签</span>
                          )}
                        </div>

                        {/* 数据量（字符数） */}
                        <div className="text-xs text-slate-500 shrink-0 w-24 text-right">
                          {doc.format.toUpperCase() === 'PNG' || doc.format.toUpperCase() === 'JPG' || doc.format.toUpperCase() === 'JPEG' ? (
                            <span className="font-medium text-slate-700">OCR 0字</span>
                          ) : (
                            <>
                              <span className="font-medium text-slate-700">{doc.charCount.toLocaleString()}</span> 字符
                            </>
                          )}
                        </div>

                        {/* 段落数 */}
                        <div className="text-xs text-slate-500 shrink-0 w-20 text-center">
                          <span className="font-medium text-slate-700">{doc.chunkCount || Math.floor(doc.charCount / 500)}</span>
                        </div>

                        {/* 文件大小 */}
	                        <div className="text-xs text-slate-500 shrink-0 w-20 text-center">
	                          <span className="font-medium text-slate-700">{doc.fileSize || `${Math.floor(doc.charCount / 1024)}KB`}</span>
	                        </div>

	                        {/* 调用次数 */}
	                        <div className="text-xs text-slate-500 shrink-0 w-24 text-center">
	                          <span className="font-medium text-slate-700">{getDocumentCallCount(doc).toLocaleString()}</span>
	                        </div>

	                        {/* 文件格式 */}
                        <div className="shrink-0 w-24 text-center">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                            {doc.format.toUpperCase()}
	                          </span>
	                        </div>

                        {/* 更新时间 */}
                        <div className="text-xs text-slate-500 shrink-0 w-32 text-right">
                          {doc.lastEdited}
                        </div>

                        {/* 添加人 */}
                        <div className="text-xs text-slate-500 shrink-0 w-20 text-right">
                          {doc.addedBy}
                        </div>

	                        {/* 合并后的状态展示：排队中 / 处理中 / 可用 / 失败 / 已禁用 */}
	                        <div className={`sticky right-[112px] z-20 text-xs shrink-0 w-24 flex justify-center shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] before:content-[''] before:absolute before:inset-y-0 before:right-full before:w-4 after:content-[''] after:absolute after:inset-y-0 after:left-full after:w-4 ${
	                          isBatchMode && selectedDocs.includes(doc.id)
	                            ? 'bg-blue-50 before:bg-blue-50 after:bg-blue-50'
	                            : 'bg-white group-hover:bg-slate-50 before:bg-white group-hover:before:bg-slate-50 after:bg-white group-hover:after:bg-slate-50'
	                        }`}>
	                          {(() => {
	                            const merged = getMergedDocStatus(doc);
	                            const config = ({
	                              Queued:     { label: '排队中', dot: 'bg-slate-400',   text: 'text-slate-600' },
	                              Processing: { label: '处理中', dot: 'bg-blue-500',    text: 'text-blue-600' },
	                              Ready:      { label: '可用',   dot: 'bg-emerald-500', text: 'text-emerald-600' },
	                              Failed:     { label: '失败',   dot: 'bg-red-500',     text: 'text-red-600' },
	                              Disabled:   { label: '已禁用', dot: 'bg-slate-300',   text: 'text-slate-400' },
	                            } as const)[merged];
	                            return (
	                              <span className={`group/status relative font-medium whitespace-nowrap flex items-center gap-2 ${config.text}`}>
	                                <span className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
	                                <span>{config.label}</span>
	                                {merged === 'Failed' && (
	                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/status:opacity-100 transition-opacity pointer-events-none z-30 shadow-xl">
	                                    <div className="font-medium mb-1">失败原因：</div>
	                                    <div className="text-slate-300">{doc.failureReason || '文件解析失败，请检查文件格式'}</div>
	                                    <div className="absolute top-full left-1/2 -translate-x-1/2">
	                                      <div className="border-[5px] border-transparent border-t-slate-900"></div>
	                                    </div>
	                                  </div>
	                                )}
	                              </span>
	                            );
	                          })()}
	                        </div>

	                        {/* 启用开关 */}
                        <div
                          className={`sticky right-0 z-20 shrink-0 w-24 flex items-center justify-center gap-2 ${
                            isBatchMode && selectedDocs.includes(doc.id)
                              ? 'bg-blue-50'
                              : 'bg-white group-hover:bg-slate-50'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // 只有已完成状态才能切换启用状态
                              if (doc.status !== 'Ready') {
                                showToast('error', '只有已完成的文档才能切换启用状态');
                                return;
                              }
                              // 切换启用状态
                              setKnowledgeBases(prev => prev.map(kb => 
                                kb.id === selectedKB?.id
                                  ? {
                                      ...kb,
                                      documents: kb.documents.map(d =>
                                        d.id === doc.id ? { ...d, enabled: !d.enabled } : d
                                      )
                                    }
                                  : kb
                              ));
                              // 更新selectedKB
                              if (selectedKB) {
                                setSelectedKB({
                                  ...selectedKB,
                                  documents: selectedKB.documents.map(d =>
                                    d.id === doc.id ? { ...d, enabled: !d.enabled } : d
                                  )
                                });
                              }
                              showToast('success', doc.enabled ? '文档已禁用' : '文档已启用');
                            }}
                            disabled={doc.status !== 'Ready'}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              doc.status !== 'Ready' 
                                ? 'bg-slate-200 cursor-not-allowed opacity-50' 
                                : doc.enabled 
                                  ? 'bg-blue-600' 
                                  : 'bg-slate-300'
                            }`}
                            title={doc.status !== 'Ready' ? '只有已完成的文档才能启用' : ''}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                (doc.status === 'Ready' && doc.enabled) ? 'translate-x-5' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        
                        {/* 更多操作按钮 - 批量模式下隐藏 */}
                        {!isBatchMode && (
                          <div className="relative shrink-0">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDropdownOpenId(dropdownOpenId === doc.id ? null : doc.id);
                              }}
                              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <MoreVertical className="w-4 h-4 text-slate-400" />
                            </button>
                            
                            <AnimatePresence>
                              {dropdownOpenId === doc.id && (
                                <motion.div
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -10 }}
                                  className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden"
	                                  onClick={(e) => e.stopPropagation()}
	                                >
	                                  <button
	                                    onClick={() => {
	                                      setRenamingDoc(doc);
	                                      setRenameDocName(doc.name);
	                                      setShowRenameDocModal(true);
	                                      setDropdownOpenId(null);
	                                    }}
	                                    className="w-full text-left px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors"
	                                  >
	                                    <Edit className="w-4 h-4" />
	                                    重命名
	                                  </button>
	                                  <button
	                                    onClick={() => {
	                                      downloadDocument(doc);
	                                      setDropdownOpenId(null);
	                                    }}
	                                    className="w-full text-left px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors"
	                                  >
	                                    <Download className="w-4 h-4" />
	                                    下载
	                                  </button>
	                                  <div className="border-t border-slate-100" />
	                                  <button
	                                    onClick={() => {
	                                      setEditingDocForTags(doc);
                                      setShowTagConfigModal(true);
                                      setDropdownOpenId(null);
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                                  >
                                    <Tag className="w-4 h-4" />
                                    配置标签
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingDoc(doc);
                                      setShowDocConfigModal(true);
                                      setDropdownOpenId(null);
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                                  >
                                    <Settings className="w-4 h-4" />
                                    配置修改
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDeletingDoc(doc);
                                      setShowSingleDeleteModal(true);
                                      setDropdownOpenId(null);
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    删除
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                        </div>
                      </div>
                    ))}
                </div>
                )}
              </div>

              <AnimatePresence>
                {isBatchMode && selectedDocs.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 18, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="fixed left-1/2 bottom-24 z-50 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl shadow-slate-300/40 backdrop-blur-md"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                          <Check className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-semibold text-slate-800">已选 {selectedDocs.length} 条</span>
                      </div>
                      <button
                        onClick={() => updateSelectedDocsEnabled(true)}
                        className="px-4 py-2 text-sm font-medium text-blue-600 rounded-xl hover:bg-blue-50 transition-all"
                      >
                        启用
                      </button>
                      <button
                        onClick={() => updateSelectedDocsEnabled(false)}
                        className="px-4 py-2 text-sm font-medium text-slate-600 rounded-xl hover:bg-slate-100 transition-all"
                      >
                        禁用
                      </button>
                      <button
                        onClick={() => setShowBatchDeleteModal(true)}
                        className="px-4 py-2 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 transition-all"
                      >
                        删除
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDocs([]);
                          setIsBatchMode(false);
                        }}
                        className="px-4 py-2 text-sm font-medium text-slate-500 rounded-xl hover:bg-slate-100 transition-all"
                      >
                        取消
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 分页 */}
              <div className="flex justify-end">
                {(() => {
                  const filteredDocsCount = (selectedKB?.documents || []).filter(doc => {
                    const matchesSearch = doc.name.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
                      doc.tags.some(tag => tag.toLowerCase().includes(docSearchQuery.toLowerCase()));
                    const matchesStatus = docStatusFilter === 'all' || getMergedDocStatus(doc) === docStatusFilter;
                    const matchesFormat = docFormatFilter.length === 0 || docFormatFilter.some(format => doc.format.toUpperCase() === format.toUpperCase());
                    const matchesTags = selectedTags.length === 0 || selectedTags.some(tag => doc.tags.includes(tag));
                    return matchesSearch && matchesStatus && matchesFormat && matchesTags;
                  }).length;
                  const totalPages = Math.max(1, Math.ceil(filteredDocsCount / docItemsPerPage));
                  
                  return (
                    <div className="inline-flex items-center gap-2.5">
                      <span className="text-sm font-medium text-slate-600">
                        共 {filteredDocsCount} 条
                      </span>

                      <button
                        onClick={() => setDocCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={docCurrentPage <= 1}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-900">
                        {Math.min(docCurrentPage, totalPages)}
                      </span>

                      <button
                        onClick={() => setDocCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={docCurrentPage >= totalPages}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      >
                        <ChevronRightIcon className="w-4 h-4" />
                      </button>

                      <div className="relative">
                        <button 
                          onClick={() => setShowPageSizeDropdown(!showPageSizeDropdown)}
                          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-blue-200 hover:text-blue-600"
                        >
                          <span>{docItemsPerPage} 条/页</span>
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        </button>
                        {showPageSizeDropdown && (
                          <div className="absolute bottom-full right-0 mb-2 w-28 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden py-1">
                            {[10, 20, 50, 100].map((size) => (
                              <button
                                key={size}
                                onClick={() => {
                                  setDocItemsPerPage(size);
                                  setDocCurrentPage(1);
                                  setShowPageSizeDropdown(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                  docItemsPerPage === size
                                    ? 'bg-blue-50 text-blue-600 font-medium'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {size} 条/页
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            </div>
          </div>
          )
        ) : (
          /* 知识库列表页 */
        <div 
          className="flex-1 flex flex-col h-full overflow-hidden"
          onClick={() => {
            setIsFilterDropdownOpen(false);
            setDropdownOpenId(null);
          }}
        >
	          {/* 内容区域 - 可滚动 */}
	          <div className="flex-1 overflow-y-auto px-8 py-6 no-scrollbar bg-slate-50">
	            <div className="max-w-[1600px] mx-auto space-y-5">
	            <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex gap-2 flex-wrap items-center">
                {/* 全部按钮 */}
                <button 
                  onClick={() => {
                    setFilterType('all');
                    setSelectedTags([]);
                    setSearchQuery('');
                  }}
	                  className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
	                    filterType === 'all'
	                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200'
	                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
	                  }`}
                >
                  全部
                </button>

                {/* 我的关注按钮 */}
                <button 
                  onClick={() => {
                    if (filterType === 'favorites') {
                      setFilterType('all');
                    } else {
                      setFilterType('favorites');
                    }
                    setCurrentPage(1);
                  }}
	                  className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
	                    filterType === 'favorites' 
	                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200' 
	                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
	                  }`}
                >
                  我的关注
                </button>

                {/* 搜索框 - 优化样式 */}
                <div className="relative w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜索知识库、标签..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all"
                  />
                </div>

                {/* 排序选择器 */}
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as 'lastModified' | 'createdTime' | 'docsCount');
                      setCurrentPage(1);
                    }}
                    className="px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all appearance-none pr-9 cursor-pointer"
                  >
                    <option value="lastModified">排序：最近更新</option>
                    <option value="createdTime">排序：创建时间</option>
                    <option value="docsCount">排序：文档数量</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>

                {/* 权限筛选器 */}
                <div className="relative">
                  <select
                    value={permissionFilter}
                    onChange={(e) => {
                      setPermissionFilter(e.target.value as 'all' | 'private' | 'public');
                      setCurrentPage(1);
                    }}
                    className="px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition-all appearance-none pr-9 cursor-pointer"
                  >
                    <option value="all">全部权限</option>
                    <option value="private">私有</option>
                    <option value="public">公开</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  onClick={() => setKbViewMode('card')}
                  title="卡片视图"
                  aria-label="卡片视图"
                  className={`h-8 w-8 rounded-md transition-all flex items-center justify-center ${
                    kbViewMode === 'card'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                      : 'text-slate-500 hover:bg-white hover:text-blue-600'
                  }`}
                >
                  <Layout className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setKbViewMode('list')}
                  title="列表视图"
                  aria-label="列表视图"
                  className={`h-8 w-8 rounded-md transition-all flex items-center justify-center ${
                    kbViewMode === 'list'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                      : 'text-slate-500 hover:bg-white hover:text-blue-600'
                  }`}
                >
                  <Menu className="w-4 h-4" />
                </button>
              </div>
            </div>
            </div>

            {/* Knowledge Base View */}
            {kbViewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {currentKnowledgeBases.map((kb) => (
                <motion.div
                  key={kb.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => {
                    setShowFileUploadPage(false);
                    setSelectedDocument(null);
                    setSelectedKB(kb);
                  }}
                  className="group relative bg-white rounded-lg border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col h-full overflow-visible"
	                >
	                  <div className="p-4 flex flex-col flex-1">
                    {/* 顶部：图标、标题、操作按钮 */}
                    <div className="flex items-start gap-3 mb-3.5">
                      {/* 图标 - 渐变背景 */}
                      <div className={`p-2.5 rounded-lg shrink-0 ${
                        kb.type === 'PDF' ? 'bg-blue-50 text-blue-600' :
                        kb.type === 'Website' ? 'bg-emerald-50 text-emerald-600' :
                        kb.type === 'Text' ? 'bg-indigo-50 text-indigo-600' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {kb.type === 'PDF' && <FileText className="w-4 h-4" />}
                        {kb.type === 'Website' && <Globe className="w-4 h-4" />}
                        {kb.type === 'Text' && <FileText className="w-4 h-4" />}
                        {kb.type === 'Files' && <FileStack className="w-4 h-4" />}
                      </div>
                      
                      {/* 标题、创建者 */}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-[15px] text-slate-900 group-hover:text-blue-600 transition-colors truncate leading-tight mb-1.5">{kb.name}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <User className="w-3 h-3" />
                            <span>{kb.creator}</span>
                          </div>
	                          {kb.permissionType === '私有知识库' && (
	                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border bg-slate-50 border-slate-200 text-slate-600">
	                              <Lock className="w-2.5 h-2.5" />
	                              <span className="text-[10px] font-medium">私有</span>
	                            </div>
	                          )}
                        </div>
	                      </div>
	                      
	                      {/* 右侧操作按钮 */}
	                      <div className="flex items-center gap-0.5 shrink-0 opacity-100 transition-opacity duration-200">
	                        {renderKnowledgeBaseMenu(kb)}
                      </div>
                    </div>

                    {/* 描述 */}
                    <p 
                      className="text-[13px] text-slate-500 leading-relaxed mb-4 flex-grow min-h-[40px]"
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        WebkitLineClamp: 2,
                      }}
                    >
                      {kb.description}
                    </p>

                    {/* 标签 */}
                    {kb.tags.length > 0 && (
                      <div 
                        className="flex flex-wrap gap-1.5 mb-4 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingKBTags(kb);
                          setShowKBTagViewModal(true);
                        }}
                        title={kb.tags.length > 3 ? "点击查看所有标签" : ""}
                      >
                        {kb.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-medium hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            #{tag}
                          </span>
                        ))}
                        {kb.tags.length > 3 && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[11px] font-semibold">
                            +{kb.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 底部统计 */}
                    <div className="grid grid-cols-[1fr_auto] items-end gap-3 pt-3 border-t border-slate-100 mt-auto">
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{kb.docsCount}</span>
                        <span className="text-slate-400">篇</span>
                      </div>
                      
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 justify-self-end">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimeAgo(kb.lastModified)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                <div className="grid grid-cols-[minmax(240px,1.4fr)_minmax(160px,1fr)_96px_112px_36px] items-center gap-3 rounded-t-lg border-b border-slate-200 bg-slate-50/90 px-4 py-3 text-xs font-semibold text-slate-500">
                  <div>知识库</div>
                  <div>标签</div>
                  <div className="text-center">文档数</div>
                  <div className="text-right">更新时间</div>
                  <div></div>
                </div>

                <div className="divide-y divide-slate-100">
                  {currentKnowledgeBases.map((kb) => {
                    return (
                      <motion.div
                        key={kb.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        onClick={() => {
                          setShowFileUploadPage(false);
                          setSelectedDocument(null);
                          setSelectedKB(kb);
                        }}
                        className="group grid grid-cols-[minmax(240px,1.4fr)_minmax(160px,1fr)_96px_112px_36px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 cursor-pointer"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`p-2.5 rounded-lg shrink-0 ${
                            kb.type === 'PDF' ? 'bg-blue-50 text-blue-600' :
                            kb.type === 'Website' ? 'bg-emerald-50 text-emerald-600' :
                            kb.type === 'Text' ? 'bg-indigo-50 text-indigo-600' :
                            'bg-amber-50 text-amber-600'
                          }`}>
                            {kb.type === 'PDF' && <FileText className="w-4 h-4" />}
                            {kb.type === 'Website' && <Globe className="w-4 h-4" />}
                            {kb.type === 'Text' && <FileText className="w-4 h-4" />}
                            {kb.type === 'Files' && <FileStack className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-blue-600">{kb.name}</h3>
                              {kb.permissionType === '私有知识库' && (
                                <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  私有
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-400">
                              <User className="w-3 h-3 shrink-0" />
                              <span className="shrink-0">{kb.creator}</span>
                              <span className="truncate text-slate-500">{kb.description}</span>
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex min-w-0 flex-wrap gap-1.5"
                          onClick={(e) => {
                            if (kb.tags.length > 0) {
                              e.stopPropagation();
                              setViewingKBTags(kb);
                              setShowKBTagViewModal(true);
                            }
                          }}
                        >
                          {kb.tags.length > 0 ? (
                            <>
                              {kb.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                >
                                  #{tag}
                                </span>
                              ))}
                              {kb.tags.length > 3 && (
                                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                                  +{kb.tags.length - 3}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-slate-300">无标签</span>
                          )}
                        </div>

                        <div className="flex items-center justify-center gap-1 text-xs text-slate-600">
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium">{kb.docsCount}</span>
                        </div>

                        <div className="flex items-center justify-end gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatTimeAgo(kb.lastModified)}</span>
                        </div>

                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          {renderKnowledgeBaseMenu(kb)}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredKnowledgeBases.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg border border-dashed border-slate-300">
                <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  <Search className="w-7 h-7 text-slate-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 mb-2">未找到匹配的知识库</h3>
                <p className="text-slate-500 text-sm">尝试更换搜索词</p>
              </div>
            )}
            </div>
          </div>

          {/* Pagination */}
          {filteredKnowledgeBases.length > 0 && (
            <div className="border-t border-slate-200 bg-white px-8 py-3 shadow-sm">
              <div className="max-w-[1600px] mx-auto flex items-center justify-end">
                <div className="inline-flex items-center gap-2.5">
                <span className="text-sm font-medium text-slate-600">
                  共 {filteredKnowledgeBases.length} 条
                </span>

                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>

                <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-900">
                  {Math.min(currentPage, totalPages)}
                </span>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                >
                  <ChevronRightIcon className="w-4 h-4 text-slate-600" />
                </button>

                <div className="relative">
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-600 shadow-sm transition-all appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 hover:border-blue-200 hover:text-blue-600"
                  >
                    <option value={10}>10 条/页</option>
                    <option value={20}>20 条/页</option>
                    <option value={50}>50 条/页</option>
                    <option value={100}>100 条/页</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingKB && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 rounded-2xl">
                    <Edit className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">编辑知识库</h2>
                    <p className="text-sm text-slate-400 font-medium">修改知识库的基本信息</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingKBTagInput('');
                  }}
                  className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">名称</label>
                  <input 
                    type="text" 
                    placeholder="知识库名称"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-700 placeholder:text-slate-300 font-medium"
                    value={editingKB.name}
                    onChange={(e) => setEditingKB({...editingKB, name: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">描述</label>
                  <textarea 
                    placeholder="知识库描述"
                    rows={3}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-700 placeholder:text-slate-300 font-medium resize-none"
                    value={editingKB.description}
                    onChange={(e) => setEditingKB({...editingKB, description: e.target.value})}
                  />
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">知识库标签</label>
                      <p className="mt-1 text-xs text-slate-500">维护该知识库的分类标签</p>
                    </div>
                    <span className="text-xs text-slate-400">{editingKB.tags.length}/10</span>
                  </div>
                  {editingKB.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {editingKB.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-sm text-blue-700">
                          #{tag}
                          <button
                            type="button"
                            onClick={() => setEditingKB({ ...editingKB, tags: editingKB.tags.filter(t => t !== tag) })}
                            className="text-blue-400 hover:text-blue-700"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white py-4 text-center text-sm text-slate-400">
                      暂无标签
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={editingKBTagInput}
                      onChange={(e) => setEditingKBTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        const nextTag = editingKBTagInput.trim();
                        if (e.key === 'Enter' && nextTag && !editingKB.tags.includes(nextTag) && editingKB.tags.length < 10) {
                          setEditingKB({ ...editingKB, tags: [...editingKB.tags, nextTag] });
                          setEditingKBTagInput('');
                        }
                      }}
                      placeholder="输入标签名称"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextTag = editingKBTagInput.trim();
                        if (nextTag && !editingKB.tags.includes(nextTag) && editingKB.tags.length < 10) {
                          setEditingKB({ ...editingKB, tags: [...editingKB.tags, nextTag] });
                          setEditingKBTagInput('');
                        }
                      }}
                      className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      添加
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recommendedTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        disabled={editingKB.tags.includes(tag) || editingKB.tags.length >= 10}
                        onClick={() => setEditingKB({ ...editingKB, tags: [...editingKB.tags, tag] })}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                          editingKB.tags.includes(tag)
                            ? 'border-slate-200 bg-white text-slate-300'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600'
                        } disabled:cursor-not-allowed`}
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 向量模型显示 */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">向量模型</label>
                  <div className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 font-medium flex items-center gap-3">
                    <Sparkles className="w-4 h-4 text-green-600" />
                    <span>{editingKB.embeddingModel}</span>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50/50 flex gap-4">
                <button 
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingKBTagInput('');
                  }}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                  取消
                </button>
                <button 
                  onClick={saveEditKB}
                  disabled={!editingKB.name || !editingKB.description}
                  className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                >
                  保存修改
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal - 需要输入知识库名称确认 */}
      <AnimatePresence>
        {deleteConfirmId && (() => {
          const kbToDelete = knowledgeBases.find(kb => kb.id === deleteConfirmId);
          if (!kbToDelete) return null;
          
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setDeleteConfirmId(null);
                  setDeleteConfirmInput('');
                }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
              >
                <div className="p-8">
                  {/* 警告图标 */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Trash2 className="w-7 h-7 text-red-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800 mb-1">删除警告</h2>
                      <p className="text-sm text-slate-500">此操作不可撤销</p>
                    </div>
                  </div>

                  {/* 警告信息 */}
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                    <p className="text-sm text-red-800 leading-relaxed">
                      确认删除该知识库？删除后该知识库内的文档、标签和权限配置都无法恢复。
                    </p>
                  </div>

                  {/* 知识库名称显示 */}
                  <div className="mb-4">
                    <div className="text-sm text-slate-600 mb-2">
                      要删除的知识库：
                    </div>
                    <div className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="font-bold text-slate-800">{kbToDelete.name}</div>
                    </div>
                  </div>

                  {/* 输入确认 */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      请输入 <span className="font-bold text-red-600">{kbToDelete.name}</span> 确认
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      placeholder={`请输入: ${kbToDelete.name}`}
                      className={`w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none transition-all ${
                        deleteConfirmInput && deleteConfirmInput.trim() === kbToDelete.name.trim()
                          ? 'border-green-500 focus:ring-2 focus:ring-green-500'
                          : deleteConfirmInput
                          ? 'border-red-500 focus:ring-2 focus:ring-red-500'
                          : 'border-slate-200 focus:ring-2 focus:ring-red-500'
                      }`}
                      autoFocus
                    />
                    {deleteConfirmInput && deleteConfirmInput.trim() !== kbToDelete.name.trim() && (
                      <p className="text-xs text-red-600 mt-2">
                        输入不匹配，请输入完整的知识库名称
                      </p>
                    )}
                    {deleteConfirmInput && deleteConfirmInput.trim() === kbToDelete.name.trim() && (
                      <p className="text-xs text-green-600 mt-2">
                        输入正确，可以删除
                      </p>
                    )}
                  </div>

                  {/* 按钮 */}
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        setDeleteConfirmId(null);
                        setDeleteConfirmInput('');
                      }}
                      className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-all active:scale-[0.98]"
                    >
                      取消
                    </button>
                    <button 
                      onClick={() => {
                        if (deleteConfirmInput.trim() === kbToDelete.name.trim()) {
                          deleteKnowledgeBase(deleteConfirmId);
                          setDeleteConfirmInput('');
                        }
                      }}
                      disabled={deleteConfirmInput.trim() !== kbToDelete.name.trim()}
                      className={`flex-1 py-3 font-medium rounded-xl transition-all active:scale-[0.98] ${
                        deleteConfirmInput.trim() === kbToDelete.name.trim()
                          ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/20 cursor-pointer'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      确认删除
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* 取消创建知识库确认弹窗 */}
      <AnimatePresence>
        {showCancelConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCancelConfirmModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* 内容 */}
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-800 mb-2">{editingNewKBId ? '确认取消编辑？' : '确认取消创建？'}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {editingNewKBId ? '当前编辑的知识库配置将不会保存。确定要取消吗？' : '您正在创建的知识库配置将会丢失，此操作无法撤销。确定要取消吗？'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 按钮 */}
              <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowCancelConfirmModal(false)}
                  className="px-5 py-2.5 text-slate-600 hover:bg-white rounded-lg font-medium transition-all border border-slate-200"
                >
                  {editingNewKBId ? '继续编辑' : '继续创建'}
                </button>
                <button
                  onClick={() => {
                    setShowCancelConfirmModal(false);
                    setShowNewKBPage(false);
                    setEditingNewKBId(null);
                    setNewKBStep(1);
                    // 重置配置
                    setNewKBConfig({
                      icon: '📚',
                      iconUrl: '',
                      name: '',
                      description: '',
                      category: '通用知识库',
                      tags: [],
                      kbType: '通用知识库',
                      retrievalMethod: '混合检索',
                      vectorModel: 'text-embedding-3-large',
                      rerankModel: 'bge-reranker-v2-m3',
                      topK: 5,
                      similarityThreshold: 0.7,
                      maxRecall: 10,
                      defaultChunkStrategy: 'smart',
                      defaultChunkSize: 800,
                      defaultOverlap: 100,
                      permissionType: 'public',
                      allowedTeams: [],
                      allowedUsers: [],
                      vectorStorage: 'default'
                    });
                  }}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all shadow-lg shadow-red-500/25"
                >
                  确认取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 推荐标签管理模态框 */}
      <AnimatePresence>
        {showTagManageModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTagManageModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 标题栏 */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Tag className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">管理推荐标签</h3>
                    <p className="text-xs text-blue-100">自定义您的标签库，方便快速添加</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTagManageModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 内容 */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {/* 添加新标签 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-700 mb-3">添加新推荐标签</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRecommendedTag}
                      onChange={(e) => setNewRecommendedTag(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && newRecommendedTag.trim()) {
                          if (!recommendedTags.includes(newRecommendedTag.trim())) {
                            setRecommendedTags([...recommendedTags, newRecommendedTag.trim()]);
                            setNewRecommendedTag('');
                          }
                        }
                      }}
                      placeholder="输入标签名称，按回车添加"
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                    />
                    <button
                      onClick={() => {
                        if (newRecommendedTag.trim() && !recommendedTags.includes(newRecommendedTag.trim())) {
                          setRecommendedTags([...recommendedTags, newRecommendedTag.trim()]);
                          setNewRecommendedTag('');
                        }
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
                    >
                      添加
                    </button>
                  </div>
                </div>

                {/* 当前推荐标签列表 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    当前推荐标签 ({recommendedTags.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {recommendedTags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm border border-blue-200"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        {tag}
                        <button
                          onClick={() => {
                            setRecommendedTags(recommendedTags.filter((_, i) => i !== index));
                          }}
                          className="hover:text-blue-900 font-bold ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {recommendedTags.length === 0 && (
                    <div className="text-center py-8 text-slate-400">
                      <Tag className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">暂无推荐标签，请添加</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowTagManageModal(false)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 成员详情模态框 */}
      <AnimatePresence>
        {showMemberDetailModal && selectedMemberDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMemberDetailModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-8 text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-3xl font-bold mb-3">
                  {selectedMemberDetail.name.charAt(0)}
                </div>
                <h3 className="text-xl font-bold text-white">{selectedMemberDetail.name}</h3>
                <p className="text-sm text-blue-100 mt-1">成员详情</p>
              </div>

              {/* 内容 */}
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-slate-100">
                    <span className="text-sm text-slate-600">用户ID</span>
                    <span className="text-sm font-medium text-slate-800">{selectedMemberDetail.id}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-slate-100">
                    <span className="text-sm text-slate-600">姓名</span>
                    <span className="text-sm font-medium text-slate-800">{selectedMemberDetail.name}</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm text-slate-600">状态</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      活跃
                    </span>
                  </div>
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="bg-slate-50 px-6 py-4 flex items-center justify-end">
                <button
                  onClick={() => setShowMemberDetailModal(false)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 配置标签模态框 */}
      <AnimatePresence>
        {showTagConfigModal && editingDocForTags && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowTagConfigModal(false);
                setEditingDocForTags(null);
                setNewTagInput('');
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <Tag className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">配置标签</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{editingDocForTags.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowTagConfigModal(false);
                    setEditingDocForTags(null);
                    setNewTagInput('');
                  }}
                  className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* 添加标签 */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">添加新标签</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && newTagInput.trim()) {
                          if (!editingDocForTags.tags.includes(newTagInput.trim())) {
                            setKnowledgeBases(prev => prev.map(kb => 
                              kb.id === selectedKB?.id 
                                ? { ...kb, documents: kb.documents?.map(d => 
                                    d.id === editingDocForTags.id 
                                      ? { ...d, tags: [...d.tags, newTagInput.trim()] }
                                      : d
                                  ) || [] }
                                : kb
                            ));
                            if (selectedKB) {
                              setSelectedKB({
                                ...selectedKB,
                                documents: selectedKB.documents?.map(d => 
                                  d.id === editingDocForTags.id 
                                    ? { ...d, tags: [...d.tags, newTagInput.trim()] }
                                    : d
                                ) || []
                              });
                            }
                            setEditingDocForTags({
                              ...editingDocForTags,
                              tags: [...editingDocForTags.tags, newTagInput.trim()]
                            });
                          }
                          setNewTagInput('');
                        }
                      }}
                      placeholder="输入标签名称，按回车添加"
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    <button
                      onClick={() => {
                        if (newTagInput.trim() && !editingDocForTags.tags.includes(newTagInput.trim())) {
                          setKnowledgeBases(prev => prev.map(kb => 
                            kb.id === selectedKB?.id 
                              ? { ...kb, documents: kb.documents?.map(d => 
                                  d.id === editingDocForTags.id 
                                    ? { ...d, tags: [...d.tags, newTagInput.trim()] }
                                    : d
                                ) || [] }
                              : kb
                          ));
                          if (selectedKB) {
                            setSelectedKB({
                              ...selectedKB,
                              documents: selectedKB.documents?.map(d => 
                                d.id === editingDocForTags.id 
                                  ? { ...d, tags: [...d.tags, newTagInput.trim()] }
                                  : d
                              ) || []
                            });
                          }
                          setEditingDocForTags({
                            ...editingDocForTags,
                            tags: [...editingDocForTags.tags, newTagInput.trim()]
                          });
                          setNewTagInput('');
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all"
                    >
                      添加
                    </button>
                  </div>
                </div>

                {/* 当前标签列表 */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-3 block">
                    当前标签 ({editingDocForTags.tags.length})
                  </label>
                  {editingDocForTags.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {editingDocForTags.tags.map((tag, index) => (
                        <div
                          key={index}
                          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-2 group hover:bg-slate-200 transition-all"
                        >
                          <Tag className="w-3.5 h-3.5 text-slate-500" />
                          <span>{tag}</span>
                          <button
                            onClick={() => {
                              setKnowledgeBases(prev => prev.map(kb => 
                                kb.id === selectedKB?.id 
                                  ? { ...kb, documents: kb.documents?.map(d => 
                                      d.id === editingDocForTags.id 
                                        ? { ...d, tags: d.tags.filter(t => t !== tag) }
                                        : d
                                    ) || [] }
                                  : kb
                              ));
                              if (selectedKB) {
                                setSelectedKB({
                                  ...selectedKB,
                                  documents: selectedKB.documents?.map(d => 
                                    d.id === editingDocForTags.id 
                                      ? { ...d, tags: d.tags.filter(t => t !== tag) }
                                      : d
                                  ) || []
                                });
                              }
                              setEditingDocForTags({
                                ...editingDocForTags,
                                tags: editingDocForTags.tags.filter(t => t !== tag)
                              });
                            }}
                            className="p-0.5 hover:bg-red-100 rounded text-slate-400 hover:text-red-600 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      暂无标签，请添加标签
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => {
                    setShowTagConfigModal(false);
                    setEditingDocForTags(null);
                    setNewTagInput('');
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    // 检查是否有标签变化
                    const originalTags = knowledgeBases
                      .find(kb => kb.id === selectedKB?.id)
                      ?.documents.find(doc => doc.id === editingDocForTags?.id)?.tags || [];
                    const hasChanges = JSON.stringify(originalTags.sort()) !== JSON.stringify(editingDocForTags?.tags.sort());
                    
                    setShowTagConfigModal(false);
                    setEditingDocForTags(null);
                    setNewTagInput('');
                    
                    // 总是显示完成提示
                    if (hasChanges) {
                      showToast('success', '标签配置已完成');
                    } else {
                      showToast('success', '标签配置完成');
                    }
                  }}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 查看标签模态框 */}
      <AnimatePresence>
        {showTagViewModal && viewingDocTags && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowTagViewModal(false);
                setViewingDocTags(null);
              }}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Tag className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">文档标签</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{viewingDocTags.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowTagViewModal(false);
                    setViewingDocTags(null);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* 标签列表 */}
              <div className="p-6">
                {viewingDocTags.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {viewingDocTags.tags.map((tag, index) => (
                      <div
                        key={index}
                        className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-slate-200 transition-colors"
                      >
                        <Tag className="w-4 h-4 text-slate-500" />
                        {tag}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Tag className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-400 text-sm">该文档暂无标签</p>
                  </div>
                )}
              </div>

              {/* 底部统计 */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">标签总数</span>
                  <span className="font-bold text-slate-700">{viewingDocTags.tags.length} 个</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 知识库标签查看模态框 */}
      <AnimatePresence>
        {showKBTagViewModal && viewingKBTags && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowKBTagViewModal(false);
                setViewingKBTags(null);
              }}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Tag className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">知识库标签</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{viewingKBTags.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowKBTagViewModal(false);
                    setViewingKBTags(null);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* 标签列表 */}
              <div className="p-6">
                {viewingKBTags.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {viewingKBTags.tags.map((tag, index) => (
                      <div
                        key={index}
                        className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-slate-200 transition-colors"
                      >
                        <Tag className="w-4 h-4 text-slate-500" />
                        {tag}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Tag className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-slate-400 text-sm">该知识库暂无标签</p>
                  </div>
                )}
              </div>

              {/* 底部统计 */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">标签总数</span>
                  <span className="font-bold text-slate-700">{viewingKBTags.tags.length} 个</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 知识库标签配置模态框 */}
      <AnimatePresence>
        {showKBTagConfigModal && editingKBForTags && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowKBTagConfigModal(false);
                setEditingKBForTags(null);
                setNewKBTagInput('');
              }}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Tag className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">配置标签</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{editingKBForTags.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowKBTagConfigModal(false);
                    setEditingKBForTags(null);
                    setNewKBTagInput('');
                  }}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="p-6 space-y-6">
                {/* 添加标签 */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">添加新标签</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="输入标签名称..."
                      value={newKBTagInput}
                      onChange={(e) => setNewKBTagInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && newKBTagInput.trim()) {
                          const updatedKB = {
                            ...editingKBForTags,
                            tags: [...editingKBForTags.tags, newKBTagInput.trim()]
                          };
                          setKnowledgeBases(prev => 
                            prev.map(kb => kb.id === editingKBForTags.id ? updatedKB : kb)
                          );
                          setEditingKBForTags(updatedKB);
                          setNewKBTagInput('');
                        }
                      }}
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    />
                    <button
                      onClick={() => {
                        if (newKBTagInput.trim()) {
                          const updatedKB = {
                            ...editingKBForTags,
                            tags: [...editingKBForTags.tags, newKBTagInput.trim()]
                          };
                          setKnowledgeBases(prev => 
                            prev.map(kb => kb.id === editingKBForTags.id ? updatedKB : kb)
                          );
                          setEditingKBForTags(updatedKB);
                          setNewKBTagInput('');
                        }
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all"
                    >
                      添加
                    </button>
                  </div>
                </div>

                {/* 现有标签列表 */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">
                    现有标签 ({editingKBForTags.tags.length})
                  </label>
                  {editingKBForTags.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {editingKBForTags.tags.map((tag, index) => (
                        <div
                          key={index}
                          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium flex items-center gap-2 group hover:bg-slate-200 transition-colors"
                        >
                          <Tag className="w-3.5 h-3.5 text-slate-500" />
                          {tag}
                          <button
                            onClick={() => {
                              const updatedKB = {
                                ...editingKBForTags,
                                tags: editingKBForTags.tags.filter((_, i) => i !== index)
                              };
                              setKnowledgeBases(prev => 
                                prev.map(kb => kb.id === editingKBForTags.id ? updatedKB : kb)
                              );
                              setEditingKBForTags(updatedKB);
                            }}
                            className="hover:bg-red-100 rounded-full p-0.5 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-3.5 h-3.5 text-red-600" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-slate-50 rounded-xl">
                      <Tag className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">暂无标签，请添加</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => {
                    setShowKBTagConfigModal(false);
                    setEditingKBForTags(null);
                    setNewKBTagInput('');
                  }}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    // 检查是否有标签变化
                    const originalTags = knowledgeBases.find(kb => kb.id === editingKBForTags?.id)?.tags || [];
                    const hasChanges = JSON.stringify(originalTags.sort()) !== JSON.stringify(editingKBForTags?.tags.sort());
                    
                    setShowKBTagConfigModal(false);
                    setEditingKBForTags(null);
                    setNewKBTagInput('');
                    
                    // 总是显示完成提示
                    if (hasChanges) {
                      showToast('success', '标签配置已完成');
                    } else {
                      showToast('success', '标签配置完成');
                    }
                  }}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 文档配置修改模态框 */}
      <AnimatePresence>
        {showDocConfigModal && editingDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDocConfigModal(false)}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Settings className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">配置修改</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{editingDoc.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowDocConfigModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 内容区域 - 可滚动 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* 1. 托管切片 - 浅灰色卡片背景 */}
                <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    托管切片
                  </h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-slate-600 mb-2 block">存储检索资源：</label>
                      <div className="text-sm text-slate-800 font-medium">{selectedKB?.vectorStorage || '默认存储'}</div>
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 mb-2 block">向量模型：</label>
                      <div className="text-sm text-slate-800 font-medium">{selectedKB?.embeddingModel || '向量模型 v4'}</div>
                    </div>
                  </div>
                </div>

                {/* 2. 导入文件源头 - 浅灰色卡片背景 */}
                <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-blue-600" />
                    导入文件源头
                  </h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm text-slate-600 mb-2 block">导入方式：</label>
                      <div className="text-sm text-slate-800 font-medium">本地上传</div>
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 mb-2 block">导入来源：</label>
                      <div className="text-sm text-slate-800 font-medium">本地文件</div>
                    </div>
                  </div>
                </div>

                {/* 3. 配置解析策略 - 浅灰色卡片背景，水平等分布局 */}
                <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    配置解析策略
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={docConfig.textExtraction}
                        onChange={(e) => setDocConfig({...docConfig, textExtraction: e.target.checked})}
                        className="mt-0.5 w-4.5 h-4.5 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-800 block">文字提取</span>
                        <p className="text-xs text-slate-500 mt-1">基于规则的文档文字提取</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={docConfig.layoutAnalysis}
                        onChange={(e) => setDocConfig({...docConfig, layoutAnalysis: e.target.checked})}
                        className="mt-0.5 w-4.5 h-4.5 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-800 block">版面分析</span>
                        <p className="text-xs text-slate-500 mt-1">识别文档文本版面、标题位置信息</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={docConfig.ocrEnabled}
                        onChange={(e) => setDocConfig({...docConfig, ocrEnabled: e.target.checked})}
                        className="mt-0.5 w-4.5 h-4.5 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-800 block">图片文字识别(OCR)</span>
                        <p className="text-xs text-slate-500 mt-1">识别图片中的文字，适用于手稿扫描件等</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 4. 切片策略 - 浅灰色卡片背景，两列布局 */}
                <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-blue-600" />
                    切片策略
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl hover:bg-white transition-all">
                      <input
                        type="radio"
                        name="sliceMethod"
                        value="smart"
                        checked={docConfig.sliceMethod === 'smart'}
                        onChange={(e) => setDocConfig({...docConfig, sliceMethod: e.target.value})}
                        className="mt-1 w-4.5 h-4.5 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800 mb-1">智能切片</div>
                        <p className="text-xs text-slate-500">AI自动识别文档结构进行切片</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl hover:bg-white transition-all">
                      <input
                        type="radio"
                        name="sliceMethod"
                        value="length"
                        checked={docConfig.sliceMethod === 'length'}
                        onChange={(e) => setDocConfig({...docConfig, sliceMethod: e.target.value})}
                        className="mt-1 w-4.5 h-4.5 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800 mb-1">按照长度切分</div>
                        <p className="text-xs text-slate-500">按固定字符长度切分文档</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl hover:bg-white transition-all">
                      <input
                        type="radio"
                        name="sliceMethod"
                        value="title"
                        checked={docConfig.sliceMethod === 'title'}
                        onChange={(e) => setDocConfig({...docConfig, sliceMethod: e.target.value})}
                        className="mt-1 w-4.5 h-4.5 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800 mb-1">按标题切分</div>
                        <p className="text-xs text-slate-500">根据文档标题层级切分</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl hover:bg-white transition-all">
                      <input
                        type="radio"
                        name="sliceMethod"
                        value="regex"
                        checked={docConfig.sliceMethod === 'regex'}
                        onChange={(e) => setDocConfig({...docConfig, sliceMethod: e.target.value})}
                        className="mt-1 w-4.5 h-4.5 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800 mb-1">按正则切分</div>
                        <p className="text-xs text-slate-500">使用正则表达式自定义切分规则</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl hover:bg-white transition-all">
                      <input
                        type="radio"
                        name="sliceMethod"
                        value="page"
                        checked={docConfig.sliceMethod === 'page'}
                        onChange={(e) => setDocConfig({...docConfig, sliceMethod: e.target.value})}
                        className="mt-1 w-4.5 h-4.5 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800 mb-1">按页切分</div>
                        <p className="text-xs text-slate-500">按文档页面进行切分</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl hover:bg-white transition-all">
                      <input
                        type="radio"
                        name="sliceMethod"
                        value="separator"
                        checked={docConfig.sliceMethod === 'separator'}
                        onChange={(e) => setDocConfig({...docConfig, sliceMethod: e.target.value})}
                        className="mt-1 w-4.5 h-4.5 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800 mb-1">按符号切分</div>
                        <p className="text-xs text-slate-500">按指定分隔符切分文档</p>
                      </div>
                    </label>
                  </div>

                  {/* 切片参数配置 */}
                  {docConfig.sliceMethod === 'length' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">最大长度</label>
                          <input
                            type="number"
                            value={docConfig.sliceConfig.maxLength}
                            onChange={(e) => setDocConfig({
                              ...docConfig,
                              sliceConfig: {...docConfig.sliceConfig, maxLength: parseInt(e.target.value)}
                            })}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">重叠长度</label>
                          <input
                            type="number"
                            value={docConfig.sliceConfig.lengthOverlap}
                            onChange={(e) => setDocConfig({
                              ...docConfig,
                              sliceConfig: {...docConfig.sliceConfig, lengthOverlap: parseInt(e.target.value)}
                            })}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {docConfig.sliceMethod === 'smart' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">最小切片长度</label>
                          <input
                            type="number"
                            defaultValue={200}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">最大切片长度</label>
                          <input
                            type="number"
                            defaultValue={1000}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600 mb-2 block">语义相似度阈值</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          defaultValue={0.7}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                          <span>0.0</span>
                          <span>0.7</span>
                          <span>1.0</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {docConfig.sliceMethod === 'title' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">标题层级</label>
                          <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm">
                            <option value="h1">一级标题 (H1)</option>
                            <option value="h2" selected>二级标题 (H2)</option>
                            <option value="h3">三级标题 (H3)</option>
                            <option value="all">所有标题</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">包含子标题</label>
                          <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm">
                            <option value="yes" selected>是</option>
                            <option value="no">否</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {docConfig.sliceMethod === 'regex' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      <div>
                        <label className="text-sm text-slate-600 mb-2 block">正则表达式</label>
                        <input
                          type="text"
                          placeholder="例如: \n\n+ 或 ^#+\s"
                          defaultValue="\n\n+"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-mono"
                        />
                        <p className="text-xs text-slate-500 mt-1">使用正则表达式匹配切分位置</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">最小切片长度</label>
                          <input
                            type="number"
                            defaultValue={100}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">忽略空白切片</label>
                          <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm">
                            <option value="yes" selected>是</option>
                            <option value="no">否</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {docConfig.sliceMethod === 'page' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">每页字符数</label>
                          <input
                            type="number"
                            defaultValue={500}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">合并短页</label>
                          <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm">
                            <option value="yes" selected>是</option>
                            <option value="no">否</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-slate-600 mb-2 block">页面范围</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            placeholder="起始页"
                            defaultValue={1}
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                          <span className="text-slate-400">-</span>
                          <input
                            type="number"
                            placeholder="结束页"
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {docConfig.sliceMethod === 'separator' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                      <div>
                        <label className="text-sm text-slate-600 mb-2 block">分隔符</label>
                        <input
                          type="text"
                          placeholder="例如: \n\n 或 --- 或 ;;;"
                          defaultValue="\n\n"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-mono"
                        />
                        <p className="text-xs text-slate-500 mt-1">使用特定字符或字符串作为分隔符</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">保留分隔符</label>
                          <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm">
                            <option value="no" selected>否</option>
                            <option value="yes">是</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm text-slate-600 mb-2 block">最小切片长度</label>
                          <input
                            type="number"
                            defaultValue={50}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 bg-white border-t border-slate-200">
                <button 
                  onClick={() => {
                    // 根据当前文档和配置生成预览切片数据
                    const generateSlicePreview = () => {
                      // 模拟文档内容
                      const documentContent = `
# ${editingDoc.name}

## 第一章 概述
本文档详细介绍了系统的核心功能和使用方法。通过本文档，您可以快速了解系统的架构设计、功能模块以及操作流程。

## 第二章 系统架构
系统采用微服务架构设计，包含用户服务、订单服务、支付服务等多个独立模块。每个服务都可以独立部署和扩展，保证了系统的高可用性和可维护性。

### 2.1 用户服务
用户服务负责处理用户注册、登录、权限管理等功能。采用JWT令牌进行身份验证，支持多种登录方式包括账号密码、手机验证码、第三方授权等。

### 2.2 订单服务
订单服务管理整个订单生命周期，从订单创建、支付、发货到完成。支持订单状态追踪、订单取消、退款等操作。

## 第三章 功能说明
系统提供了丰富的功能模块，包括但不限于：商品管理、库存管理、营销活动、数据分析等。每个功能模块都经过精心设计，确保用户体验流畅。

## 第四章 操作指南
详细的操作步骤说明，帮助用户快速上手。包含常见问题解答和最佳实践建议。

## 第五章 API接口文档
提供完整的API接口文档，包括接口地址、请求参数、响应格式、错误码说明等。所有接口都遵循RESTful设计规范。
                      `.trim();

                      let slices: Array<{id: string, content: string, charCount: number}> = [];
                      
                      if (docConfig.sliceMethod === 'smart') {
                        // 智能切片：按语义单元切分
                        slices = [
                          { id: 'slice-1', content: `# ${editingDoc.name}\n\n## 第一章 概述\n本文档详细介绍了系统的核心功能和使用方法。通过本文档，您可以快速了解系统的架构设计、功能模块以及操作流程。`, charCount: 89 },
                          { id: 'slice-2', content: '## 第二章 系统架构\n系统采用微服务架构设计，包含用户服务、订单服务、支付服务等多个独立模块。每个服务都可以独立部署和扩展，保证了系统的高可用性和可维护性。', charCount: 92 },
                          { id: 'slice-3', content: '### 2.1 用户服务\n用户服务负责处理用户注册、登录、权限管理等功能。采用JWT令牌进行身份验证，支持多种登录方式包括账号密码、手机验证码、第三方授权等。', charCount: 88 },
                          { id: 'slice-4', content: '### 2.2 订单服务\n订单服务管理整个订单生命周期，从订单创建、支付、发货到完成。支持订单状态追踪、订单取消、退款等操作。', charCount: 72 },
                          { id: 'slice-5', content: '## 第三章 功能说明\n系统提供了丰富的功能模块，包括但不限于：商品管理、库存管理、营销活动、数据分析等。每个功能模块都经过精心设计，确保用户体验流畅。', charCount: 85 },
                          { id: 'slice-6', content: '## 第四章 操作指南\n详细的操作步骤说明，帮助用户快速上手。包含常见问题解答和最佳实践建议。', charCount: 52 },
                          { id: 'slice-7', content: '## 第五章 API接口文档\n提供完整的API接口文档，包括接口地址、请求参数、响应格式、错误码说明等。所有接口都遵循RESTful设计规范。', charCount: 78 }
                        ];
                      } else if (docConfig.sliceMethod === 'length') {
                        // 按长度切片：固定字符数
                        const maxLen = docConfig.sliceConfig.maxLength;
                        const overlap = docConfig.sliceConfig.lengthOverlap;
                        let start = 0;
                        let index = 1;
                        while (start < documentContent.length) {
                          const end = Math.min(start + maxLen, documentContent.length);
                          const content = documentContent.substring(start, end);
                          slices.push({
                            id: `slice-${index}`,
                            content: content.trim(),
                            charCount: content.trim().length
                          });
                          start = end - overlap;
                          index++;
                          if (slices.length >= 10) break; // 限制最多10个切片用于预览
                        }
                      } else if (docConfig.sliceMethod === 'title') {
                        // 按标题切片：按章节标题切分
                        const sections = documentContent.split(/(?=##\s)/);
                        slices = sections.filter(s => s.trim()).map((section, i) => ({
                          id: `slice-${i + 1}`,
                          content: section.trim(),
                          charCount: section.trim().length
                        }));
                      } else if (docConfig.sliceMethod === 'page') {
                        // 按页切片：模拟每页约500字符
                        const pageSize = 500;
                        let start = 0;
                        let index = 1;
                        while (start < documentContent.length) {
                          const end = Math.min(start + pageSize, documentContent.length);
                          const content = documentContent.substring(start, end);
                          slices.push({
                            id: `slice-${index}`,
                            content: content.trim(),
                            charCount: content.trim().length
                          });
                          start = end;
                          index++;
                          if (slices.length >= 8) break;
                        }
                      } else if (docConfig.sliceMethod === 'regex') {
                        // 按正则切片：按段落切分
                        const paragraphs = documentContent.split(/\n\n+/);
                        slices = paragraphs.filter(p => p.trim()).map((para, i) => ({
                          id: `slice-${i + 1}`,
                          content: para.trim(),
                          charCount: para.trim().length
                        }));
                      } else if (docConfig.sliceMethod === 'separator') {
                        // 按符号切片：按章节分隔
                        const sections = documentContent.split(/(?=##?\s)/);
                        slices = sections.filter(s => s.trim()).map((section, i) => ({
                          id: `slice-${i + 1}`,
                          content: section.trim(),
                          charCount: section.trim().length
                        }));
                      }
                      
                      return slices;
                    };
                    
                    setSlicePreviewData(generateSlicePreview());
                    setShowSlicePreview(true);
                  }}
                  className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 hover:border-slate-400 transition-all flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  生成预览切片
                </button>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowDocConfigModal(false)}
                    className="px-6 py-2.5 bg-white border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 hover:border-slate-400 transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      // 保存配置逻辑
                      setShowDocConfigModal(false);
                      showToast('success', '文档配置已保存');
                    }}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/25"
                  >
                    保存配置
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 切片预览模态框 */}
      <AnimatePresence>
        {showSlicePreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSlicePreview(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="px-8 py-6 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                      <Eye className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800">切片预览</h2>
                      <p className="text-sm text-slate-600 mt-1">查看文档切片效果，共 {slicePreviewData.length} 个切片</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowSlicePreview(false)}
                    className="p-2.5 hover:bg-white/80 rounded-xl text-slate-500 hover:text-slate-700 transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="space-y-4">
                  {slicePreviewData.map((slice, index) => (
                    <motion.div
                      key={slice.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="group relative bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-2xl border-2 border-slate-200 hover:border-blue-300 transition-all p-6 hover:shadow-lg"
                    >
                      {/* 切片编号标签 */}
                      <div className="absolute -top-3 -left-3 w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                        <span className="text-white font-bold text-sm">#{index + 1}</span>
                      </div>

                      {/* 切片内容 */}
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
                                <FileText className="w-3.5 h-3.5" />
                                <span>切片 {index + 1}</span>
                              </div>
                              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                                <Hash className="w-3.5 h-3.5" />
                                <span>{slice.charCount} 字符</span>
                              </div>
                            </div>
                            <p className="text-slate-700 leading-relaxed text-sm">
                              {slice.content}
                            </p>
                          </div>
                        </div>

                        {/* 切片元信息 */}
                        <div className="flex items-center gap-4 pt-4 border-t border-slate-200">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span>已向量化</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span>预计检索时间: &lt;50ms</span>
                          </div>
                          <div className="flex-1"></div>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                            <Copy className="w-3.5 h-3.5" />
                            <span>复制内容</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* 切片统计信息 */}
                <div className="mt-8 grid grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-5 border border-blue-200">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                        <FileStack className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-blue-600 font-medium">总切片数</p>
                        <p className="text-2xl font-bold text-blue-900">{slicePreviewData.length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-5 border border-green-200">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
                        <Hash className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-green-600 font-medium">平均字符数</p>
                        <p className="text-2xl font-bold text-green-900">
                          {Math.round(slicePreviewData.reduce((sum, s) => sum + s.charCount, 0) / slicePreviewData.length)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-5 border border-purple-200">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-purple-600 font-medium">切片质量</p>
                        <p className="text-2xl font-bold text-purple-900">优秀</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>切片配置：{fileParseConfig.sliceMethod === 'smart' ? '智能切片' : fileParseConfig.sliceMethod === 'length' ? '长度切片' : fileParseConfig.sliceMethod === 'regex' ? '正则切片' : fileParseConfig.sliceMethod === 'page' ? '按页切片' : fileParseConfig.sliceMethod === 'title' ? '按标题切片' : '自定义切片'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowSlicePreview(false)}
                    className="px-6 py-2.5 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-50 hover:border-slate-400 transition-all"
                  >
                    关闭预览
                  </button>
                  <button
                    onClick={() => {
                      setShowSlicePreview(false);
                      // 这里可以添加应用配置的逻辑
                    }}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-medium text-sm hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>应用此配置</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 文件上传退出确认弹窗 */}
      <AnimatePresence>
        {showFileUploadExitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFileUploadExitModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">保存上传配置？</h2>
                <p className="text-sm text-slate-500 mb-6">
                  检测到您已配置了部分内容，是否保存配置以便下次使用？
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // 不保存，直接退出
                    setShowFileUploadPage(false);
                    setShowFileUploadExitModal(false);
                    setUploadingFiles([]);
                    setFileUploadTags([]);
                    setFileUploadTagInput('');
                    // 重置文件解析配置
                    setFileParseConfig({
                      sliceMethod: 'smart',
                      smartMaxLength: 800,
                      smartOverlap: 100,
                      lengthMaxLength: 800,
                      lengthOverlap: 100,
                      regexPattern: '\\n\\n',
                      regexMaxLength: 1000,
                      pagesPerChunk: 1,
                      mergeShortPages: true,
                      titleLevel: 1,
                      titleMaxLength: 1000,
                      customSeparator: '。',
                      customKeepSeparator: false,
                      customMaxLength: 800
                    });
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-all"
                >
                  不保存
                </button>
                <button
                  onClick={() => {
                    // 保存配置并退出
                    setShowFileUploadPage(false);
                    setShowFileUploadExitModal(false);
                    setUploadingFiles([]);
                    showToast('success', '上传配置已保存');
                  }}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all"
                >
                  保存配置
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 批量删除确认弹窗 */}
      <AnimatePresence>
        {showBatchDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBatchDeleteModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">确认删除文档？</h2>
                <p className="text-sm text-slate-500 mb-6">
                  确定要删除选中的 <span className="font-bold text-red-600">{selectedDocs.length}</span> 个文档吗？删除后将无法恢复。
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBatchDeleteModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    // 执行删除
                    setKnowledgeBases(prev => prev.map(kb => 
                      kb.id === selectedKB?.id 
                        ? { ...kb, documents: kb.documents?.filter(d => !selectedDocs.includes(d.id)) || [] }
                        : kb
                    ));
                    if (selectedKB) {
                      setSelectedKB({
                        ...selectedKB,
                        documents: selectedKB.documents?.filter(d => !selectedDocs.includes(d.id)) || []
                      });
                    }
                    const deletedCount = selectedDocs.length;
                    setSelectedDocs([]);
                    setIsBatchMode(false);
                    setShowBatchDeleteModal(false);
                    showToast('success', `已成功删除 ${deletedCount} 个文档`);
                  }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-all"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
	      </AnimatePresence>

	      {/* 文档重命名弹窗 */}
	      <AnimatePresence>
	        {showRenameDocModal && renamingDoc && (
	          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
	            <motion.div
	              initial={{ opacity: 0 }}
	              animate={{ opacity: 1 }}
	              exit={{ opacity: 0 }}
	              onClick={() => {
	                setShowRenameDocModal(false);
	                setRenamingDoc(null);
	                setRenameDocName('');
	              }}
	              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
	            />
	            <motion.div
	              initial={{ scale: 0.95, opacity: 0 }}
	              animate={{ scale: 1, opacity: 1 }}
	              exit={{ scale: 0.95, opacity: 0 }}
	              className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
	            >
	              <div className="mb-5">
	                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
	                  <Edit className="w-6 h-6 text-blue-600" />
	                </div>
	                <h2 className="text-xl font-bold text-slate-800 mb-1">重命名文件</h2>
	                <p className="text-sm text-slate-500">修改后会同步更新当前文件列表中的名称。</p>
	              </div>

	              <label className="block text-sm font-medium text-slate-700 mb-2">文件名称</label>
	              <input
	                type="text"
	                value={renameDocName}
	                onChange={(e) => setRenameDocName(e.target.value)}
	                onKeyDown={(e) => {
	                  if (e.key === 'Enter') {
	                    renameDocument();
	                  }
	                  if (e.key === 'Escape') {
	                    setShowRenameDocModal(false);
	                    setRenamingDoc(null);
	                    setRenameDocName('');
	                  }
	                }}
	                autoFocus
	                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
	                placeholder="请输入新的文件名称"
	              />

	              <div className="flex gap-3 mt-6">
	                <button
	                  onClick={() => {
	                    setShowRenameDocModal(false);
	                    setRenamingDoc(null);
	                    setRenameDocName('');
	                  }}
	                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-all"
	                >
	                  取消
	                </button>
	                <button
	                  onClick={renameDocument}
	                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all"
	                >
	                  保存
	                </button>
	              </div>
	            </motion.div>
	          </div>
	        )}
	      </AnimatePresence>

      {/* 切片内容编辑弹窗 */}
      <AnimatePresence>
        {showChunkEditModal && editingChunkId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChunkEditModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col"
              style={{ maxHeight: '80vh' }}
            >
              {/* 弹窗头部 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                    <Edit className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">编辑切片内容</h2>
                    <p className="text-xs text-slate-500 mt-0.5">切片 #{editingChunkId}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowChunkEditModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 编辑区域 */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="relative">
                  <textarea
                    value={editingChunkText}
                    onChange={(e) => setEditingChunkText(e.target.value)}
                    autoFocus
                    rows={14}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 leading-7 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                    placeholder="请输入切片内容"
                  />
                  <span className="absolute bottom-3 right-3 text-xs text-slate-400">{editingChunkText.length} 字符</span>
                </div>
              </div>

              {/* 弹窗底部 */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  onClick={() => setShowChunkEditModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-all text-sm"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (editingChunkId !== null) {
                      setChunkEdits(prev => ({ ...prev, [editingChunkId]: editingChunkText }));
                      setShowChunkEditModal(false);
                      showToast('success', '切片内容已保存');
                    }
                  }}
                  disabled={editingChunkText.trim() === ''}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

	      {/* 单个文档删除确认弹窗 */}
	      <AnimatePresence>
        {showSingleDeleteModal && deletingDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowSingleDeleteModal(false);
                setDeletingDoc(null);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">确认删除文档？</h2>
                <p className="text-sm text-slate-500 mb-2">
                  确定要删除文档 <span className="font-bold text-slate-800">"{deletingDoc.name}"</span> 吗？
                </p>
                <p className="text-xs text-red-500 mb-6">
                  删除后将无法恢复
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSingleDeleteModal(false);
                    setDeletingDoc(null);
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    // 执行删除
                    setKnowledgeBases(prev => prev.map(kb => 
                      kb.id === selectedKB?.id 
                        ? { ...kb, documents: kb.documents?.filter(d => d.id !== deletingDoc.id) || [] }
                        : kb
                    ));
                    if (selectedKB) {
                      setSelectedKB({
                        ...selectedKB,
                        documents: selectedKB.documents?.filter(d => d.id !== deletingDoc.id) || []
                      });
                    }
                    setShowSingleDeleteModal(false);
                    setDeletingDoc(null);
                    showToast('success', '文档已成功删除');
                  }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-all"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 权限管理批量删除确认弹窗 */}
      <AnimatePresence>
        {showPermissionBatchDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPermissionBatchDeleteConfirm(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <Trash2 className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">确认批量删除用户？</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    将删除已选的 <span className="font-semibold text-red-600">{selectedPermissionUserIds.length}</span> 个用户，并解除这些用户与部门的关联。删除后不可恢复，是否继续？
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">将删除的用户</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedPermissionUsers.slice(0, 6).map((user) => (
                    <span key={user.id} className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
                      {user.name}
                    </span>
                  ))}
                  {selectedPermissionUsers.length > 6 && (
                    <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm">
                      +{selectedPermissionUsers.length - 6}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPermissionBatchDeleteConfirm(false)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    batchDeletePermissionUsers();
                    setShowPermissionBatchDeleteConfirm(false);
                  }}
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-700"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 权限管理操作弹窗 */}
      <AnimatePresence>
        {permissionAction.type && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPermissionAction({ type: null })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.form
              id="permission-action-form"
              onSubmit={(e) => {
                e.preventDefault();
                handlePermissionActionSubmit(new FormData(e.currentTarget));
              }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {permissionAction.type === 'createUser' && '添加用户'}
                    {permissionAction.type === 'editUser' && '编辑用户信息'}
                    {permissionAction.type === 'deleteUser' && '删除用户'}
                    {permissionAction.type === 'resetPassword' && '重置密码'}
                    {permissionAction.type === 'assignRole' && '分配角色'}
                    {permissionAction.type === 'toggleStatus' && '账号状态管理'}
                    {permissionAction.type === 'createRole' && '新建角色'}
                    {permissionAction.type === 'editRole' && '编辑角色权限范围'}
                    {permissionAction.type === 'deleteRole' && '删除角色'}
                    {permissionAction.type === 'viewRoleUsers' && '查看关联用户'}
                    {permissionAction.type === 'viewRolePermissions' && '查看权限范围'}
                    {permissionAction.type === 'createDepartment' && '新建部门'}
                    {permissionAction.type === 'editDepartment' && '编辑部门信息'}
                    {permissionAction.type === 'setDepartmentOwner' && '设置部门负责人'}
                    {permissionAction.type === 'deleteDepartment' && '删除部门'}
                    {permissionAction.type === 'addDepartmentMember' && '添加部门成员'}
                    {permissionAction.type === 'removeDepartmentMember' && '移出部门'}
                    {permissionAction.type === 'changeDepartmentMember' && '更换部门'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {permissionAction.user?.name || permissionAction.role?.name || permissionAction.department?.name}
                  </p>
                </div>
                <button onClick={() => setPermissionAction({ type: null })} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[62vh] overflow-y-auto p-6">
                {permissionAction.type === 'createUser' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      姓名 <span className="text-red-500">*</span>
                      <input name="name" placeholder="请输入姓名" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      账号 <span className="text-red-500">*</span>
                      <input name="account" placeholder="如 zhangsan" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      手机号 <span className="text-red-500">*</span>
                      <input name="phone" placeholder="请输入手机号" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      邮箱 <span className="text-red-500">*</span>
                      <input name="email" placeholder="请输入邮箱" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      所属部门
                      <select name="department" defaultValue={UNCONFIGURED_DEPARTMENT} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option value={UNCONFIGURED_DEPARTMENT}>{UNCONFIGURED_DEPARTMENT}</option>
                        {allDepartmentOptions.map((department) => (
                          <option key={department.id} value={department.name}>{department.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      绑定角色
                      <select name="role" defaultValue="普通成员" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        {permissionRoles.map((role) => (
                          <option key={role.id} value={role.name}>{role.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      账号状态 <span className="text-red-500">*</span>
                      <select name="status" defaultValue="在职" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option value="在职">在职</option>
                        <option value="已禁用">已禁用</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      密码
                      <input name="password" type="text" defaultValue={DEFAULT_AUTH_PASSWORD} maxLength={6} inputMode="numeric" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                  </div>
                )}

                {permissionAction.type === 'editUser' && permissionAction.user && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      姓名
                      <input name="name" defaultValue={permissionAction.user.name} readOnly className="mt-2 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-500" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      账号
                      <input name="account" defaultValue={permissionAction.user.account} readOnly className="mt-2 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-500" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      手机号
                      <input name="phone" defaultValue={permissionAction.user.phone} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      邮箱
                      <input name="email" defaultValue={permissionAction.user.email} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      所属部门
                      <select name="department" defaultValue={permissionAction.user.department} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option value={UNCONFIGURED_DEPARTMENT}>{UNCONFIGURED_DEPARTMENT}</option>
                        {allDepartmentOptions.map((department) => (
                          <option key={department.id} value={department.name}>{department.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      绑定角色
                      <select name="role" defaultValue={permissionAction.user.role} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        {permissionRoles.map((role) => (
                          <option key={role.id} value={role.name}>{role.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      账号状态
                      <select name="status" defaultValue={permissionAction.user.status} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option value="在职">在职</option>
                        <option value="已禁用">已禁用</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      密码
                      <input name="password" type="text" defaultValue={getUserPassword(permissionAction.user.id)} maxLength={6} inputMode="numeric" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                  </div>
                )}

                {permissionAction.type === 'deleteUser' && permissionAction.user && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                      删除后该用户将从用户列表和部门成员中移除，该操作不可撤销。
                    </div>
                    <label className="block text-sm font-medium text-slate-700">
                      输入账号确认删除
                      <input name="confirmUserAccount" placeholder={permissionAction.user.account} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
                    </label>
                  </div>
                )}

                {permissionAction.type === 'resetPassword' && permissionAction.user && (
                  <div className="space-y-5">
                    <p className="text-sm text-slate-600">
                      您正在为用户 <span className="font-semibold text-slate-900">{permissionAction.user.name}</span>（{permissionAction.user.email}）重置密码
                    </p>
                    <label className="block text-sm font-semibold text-slate-700">
                      新密码
                      <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                        <input name="newPassword" type="password" placeholder="请输入新密码" className="min-w-0 flex-1 py-3 text-sm outline-none" />
                        <Eye className="h-4 w-4 text-slate-400" />
                      </div>
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                      确认新密码
                      <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                        <input name="confirmPassword" type="password" placeholder="请再次输入新密码" className="min-w-0 flex-1 py-3 text-sm outline-none" />
                        <Eye className="h-4 w-4 text-slate-400" />
                      </div>
                    </label>
                    <div className="text-sm text-slate-600">
                      <div className="mb-2 font-semibold text-slate-700">密码要求：</div>
                      <ul className="list-disc space-y-1 pl-5">
                        <li>密码不能为空</li>
                        <li>密码长度至少 6 位</li>
                        <li>两次输入的密码必须一致</li>
                      </ul>
                    </div>
                  </div>
                )}

                {permissionAction.type === 'assignRole' && permissionAction.user && (
                  <div className="space-y-3">
                    {permissionRoles.map((role) => (
                      <label key={role.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                        <input name="role" value={role.name} type="radio" defaultChecked={permissionAction.user?.role === role.name} className="mt-1 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500" />
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{role.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{role.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {permissionAction.type === 'toggleStatus' && permissionAction.user && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">当前状态：{permissionAction.user.status}</div>
                      <p className="mt-1 text-sm text-slate-500">
                        确认后将{permissionAction.user.status === '在职' ? '禁用该账号，用户将无法登录系统。' : '启用该账号，用户可重新登录系统。'}
                      </p>
                    </div>
                    <label className="text-sm font-medium text-slate-700">
                      操作原因
                      <textarea rows={3} placeholder="请输入操作原因，便于审计追踪" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                  </div>
                )}

                {permissionAction.type === 'editRole' && permissionAction.role && (
                  <div className="space-y-5">
                    <label className="block text-sm font-medium text-slate-700">
                      角色名称 <span className="text-red-500">*</span>
                      <input name="roleName" defaultValue={permissionAction.role.name} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      角色描述 <span className="text-red-500">*</span>
                      <textarea name="roleDescription" defaultValue={permissionAction.role.description} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <RolePermissionMatrix role={permissionAction.role} />
                  </div>
                )}

                {permissionAction.type === 'createRole' && (
                  <div className="space-y-5">
                    <label className="block text-sm font-medium text-slate-700">
                      角色名称 <span className="text-red-500">*</span>
                      <input name="roleName" placeholder="如 数据审核员" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      角色描述 <span className="text-red-500">*</span>
                      <textarea name="roleDescription" placeholder="说明该角色的适用范围和职责" rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <RolePermissionMatrix defaultKnowledge />
                  </div>
                )}

                {permissionAction.type === 'deleteRole' && permissionAction.role && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                      删除角色前请确认该角色不再被业务使用。当前关联用户数：{permissionAction.role.userCount} 人。
                    </div>
                    <label className="block text-sm font-medium text-slate-700">
                      输入角色名称确认删除
                      <input name="confirmRoleName" placeholder={permissionAction.role.name} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
                    </label>
                  </div>
                )}

                {permissionAction.type === 'viewRoleUsers' && permissionAction.role && (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="grid grid-cols-[minmax(180px,1fr)_130px_minmax(160px,1fr)_90px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                      <div>用户</div>
                      <div>账号</div>
                      <div>所属部门</div>
                      <div>状态</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {permissionUsers.filter(user => user.role === permissionAction.role?.name).length > 0 ? (
                        permissionUsers.filter(user => user.role === permissionAction.role?.name).map((user) => (
                          <div key={user.id} className="grid grid-cols-[minmax(180px,1fr)_130px_minmax(160px,1fr)_90px] items-center gap-3 px-4 py-3 text-sm">
                            <div className="flex min-w-0 items-center gap-3">
                              <img src={user.avatar} alt={user.name} className="h-9 w-9 rounded-lg border border-slate-200 bg-white" />
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-slate-900">{user.name}</div>
                                <div className="truncate text-xs text-slate-400">{user.email}</div>
                              </div>
                            </div>
                            <div className="text-slate-600">{user.id}</div>
                            <div className="text-slate-600">{user.department}</div>
                            <div>
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">{user.status}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-sm text-slate-400">当前没有用户绑定该角色</div>
                      )}
                    </div>
                  </div>
                )}

                {permissionAction.type === 'viewRolePermissions' && permissionAction.role && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
                      {permissionAction.role.name} 当前权限如下，内容与创建/编辑角色时配置的“权限”保持同步；此处仅支持查看，不支持修改。
                    </div>
                    <RolePermissionMatrix role={permissionAction.role} readOnly />
                  </div>
                )}

                {permissionAction.type === 'createDepartment' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700 md:col-span-2">
                      部门层级
                      <select name="parentDepartmentId" defaultValue="root" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option value="root">作为一级部门</option>
                        {allDepartmentOptions.map((department) => (
                          <option key={department.id} value={department.id}>作为“{department.name}”的子部门</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      部门名称
                      <input name="departmentName" placeholder="如 法务部门" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      部门负责人
                      <select name="departmentOwner" defaultValue="未设置" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option value="未设置">未设置</option>
                        {permissionUsers.map((user) => (
                          <option key={user.id} value={user.name}>{user.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {permissionAction.type === 'editDepartment' && permissionAction.department && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      部门名称
                      <input name="departmentName" defaultValue={permissionAction.department.name} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      部门负责人
                      <select name="departmentOwner" defaultValue={permissionAction.department.owner} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option value="未设置">未设置</option>
                        {permissionUsers.map((user) => (
                          <option key={user.id} value={user.name}>{user.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {permissionAction.type === 'setDepartmentOwner' && permissionAction.department && (
                  <label className="block text-sm font-medium text-slate-700">
                    选择负责人
                    <select name="ownerId" defaultValue={permissionUsers.find(user => user.name === permissionAction.department?.owner)?.id || ''} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                      <option value="">请选择负责人</option>
                      {permissionUsers.map((user) => (
                        <option key={user.id} value={user.id}>{user.name} · {user.department}</option>
                      ))}
                    </select>
                  </label>
                )}

                {permissionAction.type === 'deleteDepartment' && permissionAction.department && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                      删除部门后，部门成员会被标记为“未配置”，该操作不可撤销。
                    </div>
                    <label className="block text-sm font-medium text-slate-700">
                      输入部门名称确认删除
                      <input name="confirmDepartmentName" placeholder={permissionAction.department.name} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20" />
                    </label>
                  </div>
                )}

                {permissionAction.type === 'addDepartmentMember' && permissionAction.department && (
                  <label className="block text-sm font-medium text-slate-700">
                    选择要添加的成员
                    <select name="memberId" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                      <option value="">请选择成员</option>
                      {permissionUsers
                        .filter((user) => !permissionAction.department?.memberIds.includes(user.id) && user.department !== permissionAction.department?.name)
                        .map((user) => (
                          <option key={user.id} value={user.id}>{user.name} · {user.account} · {user.department}</option>
                        ))}
                    </select>
                  </label>
                )}

                {permissionAction.type === 'removeDepartmentMember' && permissionAction.department && permissionAction.user && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-red-100 bg-red-50/80 p-4 text-sm text-red-700">
                      <div className="font-semibold text-red-800">仅移出当前成员</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-medium text-slate-500">当前成员</div>
                      <div className="mt-2 flex items-center gap-3">
                        <img src={permissionAction.user.avatar} alt={permissionAction.user.name} className="h-10 w-10 rounded-lg border border-slate-200 bg-white" />
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{permissionAction.user.name}</div>
                          <div className="text-xs text-slate-500">{permissionAction.user.account} · 当前部门：{permissionAction.department.name}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {permissionAction.type === 'changeDepartmentMember' && permissionAction.department && permissionAction.user && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4 text-sm text-blue-700">
                      <div className="font-semibold text-blue-800">仅更换当前成员部门</div>
                    </div>
                    <label className="block text-sm font-medium text-slate-700">
                      目标部门
                      <select name="targetDepartmentId" defaultValue="" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option value="">请选择目标部门</option>
                        {allDepartmentOptions
                          .filter((department) => department.id !== permissionAction.department?.id)
                          .map((department) => (
                            <option key={department.id} value={department.id}>{department.name}</option>
                          ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                <button onClick={() => setPermissionAction({ type: null })} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  {permissionAction.type === 'viewRoleUsers' || permissionAction.type === 'viewRolePermissions' ? '关闭' : '取消'}
                </button>
                {permissionAction.type !== 'viewRoleUsers' && permissionAction.type !== 'viewRolePermissions' && (
                  <button
                    type="submit"
                    className={`rounded-xl px-5 py-2.5 text-sm font-medium text-white ${
                      permissionAction.type === 'deleteRole' || permissionAction.type === 'deleteDepartment' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {permissionAction.type === 'deleteRole' || permissionAction.type === 'deleteDepartment' || permissionAction.type === 'deleteUser'
                      ? '确认删除'
                      : permissionAction.type === 'removeDepartmentMember'
                        ? '确认移出'
                        : permissionAction.type === 'changeDepartmentMember'
                          ? '确认更换'
                          : '保存'}
                  </button>
                )}
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* 知识库权限管理模态框 */}
      <AnimatePresence>
        {showKBPermissionModal && editingKBForPermission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowKBPermissionModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">权限配置</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{editingKBForPermission.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowKBPermissionModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="border-b border-slate-200 px-6 pt-4">
                <div className="inline-flex rounded-lg bg-slate-100 p-1">
                  <button
                    onClick={() => setKbPermissionTab('access')}
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                      kbPermissionTab === 'access' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    访问与角色管理
                  </button>
                  <button
                    onClick={() => setKbPermissionTab('advanced')}
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                      kbPermissionTab === 'advanced' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    高级设置
                  </button>
                </div>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-y-auto p-6">
                {kbPermissionTab === 'access' ? (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                      <div className="text-sm font-semibold text-blue-900">访问与角色管理</div>
                      <p className="mt-1 text-xs text-blue-700">用户和部门分开管理，避免权限对象混在一起；角色变更、移除和搜索添加会立即更新当前配置。</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-sm font-semibold text-slate-900">用户授权</div>
                          <div className="mt-0.5 text-xs text-slate-500">精确到个人，适合临时协作者或负责人。</div>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {kbUserAccessEntries.map((item) => (
                            <div key={item.id} className="grid grid-cols-[minmax(160px,1fr)_150px_70px] items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{item.avatar}</div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-900">{item.name}</div>
                                  <div className="truncate text-xs text-slate-500">{item.sub}</div>
                                </div>
                              </div>
                              <select
                                value={item.role}
                                disabled={item.locked}
                                onChange={(e) => {
                                  const role = e.target.value as 'admin' | 'member' | 'readonly';
                                  setKbUserAccessEntries(prev => prev.map(entry => entry.id === item.id ? { ...entry, role } : entry));
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                              >
                                <option value="admin">知识库管理员</option>
                                <option value="member">普通成员</option>
                                <option value="readonly">只读成员</option>
                              </select>
                              <button
                                onClick={() => {
                                  if (item.locked) return;
                                  setKbUserAccessEntries(prev => prev.filter(entry => entry.id !== item.id));
                                  showToast('success', `已移除 ${item.name}`);
                                }}
                                disabled={item.locked}
                                className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
                              >
                                移除
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-sm font-semibold text-slate-900">部门授权</div>
                          <div className="mt-0.5 text-xs text-slate-500">按组织范围授权，部门成员默认继承对应角色。</div>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {kbDepartmentAccessEntries.map((item) => (
                            <div key={item.id} className="grid grid-cols-[minmax(160px,1fr)_150px_70px] items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">{item.avatar}</div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-900">{item.name}</div>
                                  <div className="truncate text-xs text-slate-500">{item.sub}</div>
                                </div>
                              </div>
                              <select
                                value={item.role}
                                onChange={(e) => {
                                  const role = e.target.value as 'admin' | 'member' | 'readonly';
                                  setKbDepartmentAccessEntries(prev => prev.map(entry => entry.id === item.id ? { ...entry, role } : entry));
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                <option value="admin">知识库管理员</option>
                                <option value="member">普通成员</option>
                                <option value="readonly">只读成员</option>
                              </select>
                              <button
                                onClick={() => {
                                  setKbDepartmentAccessEntries(prev => prev.filter(entry => entry.id !== item.id));
                                  showToast('success', `已移除 ${item.name}`);
                                }}
                                className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                              >
                                移除
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">添加访问对象</div>
                          <div className="mt-0.5 text-xs text-slate-500">输入姓名、账号或部门名称，下方会展示可添加的用户和部门。</div>
                        </div>
                        <select
                          value={kbAddAccessRole}
                          onChange={(e) => setKbAddAccessRole(e.target.value as 'admin' | 'member' | 'readonly')}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="member">普通成员</option>
                          <option value="admin">知识库管理员</option>
                          <option value="readonly">只读成员</option>
                        </select>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          value={kbAccessSearchQuery}
                          onChange={(e) => setKbAccessSearchQuery(e.target.value)}
                          placeholder="搜索姓名、账号或部门，如 张三 / 技术部门"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      {kbAccessSearchQuery.trim() && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">用户结果</div>
                            <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
                              {permissionUsers
                                .filter(user => !kbUserAccessEntries.some(entry => entry.id === user.id))
                                .filter(user => [user.name, user.account, user.email].some(value => value.toLowerCase().includes(kbAccessSearchQuery.trim().toLowerCase())))
                                .slice(0, 5)
                                .map(user => (
                                  <div key={user.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-slate-800">{user.name}</div>
                                      <div className="truncate text-xs text-slate-500">{user.account} · {user.department}</div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setKbUserAccessEntries(prev => [...prev, { id: user.id, name: user.name, sub: user.email, avatar: user.name.charAt(0), role: kbAddAccessRole, locked: false }]);
                                        setKbAccessSearchQuery('');
                                        showToast('success', `已添加用户 ${user.name}`);
                                      }}
                                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
                                    >
                                      添加
                                    </button>
                                  </div>
                                ))}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">部门结果</div>
                            <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
                              {allDepartmentOptions
                                .filter(department => !kbDepartmentAccessEntries.some(entry => entry.id === department.id))
                                .filter(department => [department.name, department.owner, department.id].some(value => value.toLowerCase().includes(kbAccessSearchQuery.trim().toLowerCase())))
                                .slice(0, 5)
                                .map(department => (
                                  <div key={department.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <div className="min-w-0">
                                      <div className="truncate font-medium text-slate-800">{department.name}</div>
                                      <div className="truncate text-xs text-slate-500">{department.memberCount}人 · 负责人 {department.owner}</div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setKbDepartmentAccessEntries(prev => [...prev, { id: department.id, name: department.name, sub: `${department.memberCount}人`, avatar: department.name.charAt(0), role: kbAddAccessRole, locked: false }]);
                                        setKbAccessSearchQuery('');
                                        showToast('success', `已添加部门 ${department.name}`);
                                      }}
                                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
                                    >
                                      添加
                                    </button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">系统管理员强管控</h3>
                          <p className="mt-1 text-sm text-slate-500">即使无权限，系统管理员也可强制访问，防止知识库被误锁死。</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input type="checkbox" checked={kbAdminOverrideEnabled} onChange={(e) => setKbAdminOverrideEnabled(e.target.checked)} className="peer sr-only" />
                          <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[3px] after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-600 peer-checked:after:translate-x-5" />
                        </label>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">加入审批</h3>
                          <p className="mt-1 text-sm text-slate-500">开启后，他人申请加入需知识库管理员审批。</p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input type="checkbox" checked={kbJoinApprovalEnabled} onChange={(e) => setKbJoinApprovalEnabled(e.target.checked)} className="peer sr-only" />
                          <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[3px] after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-600 peer-checked:after:translate-x-5" />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => {
                    setShowKBPermissionModal(false);
                    showToast('success', '权限配置已保存');
                  }}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30"
                >
                  保存配置
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 转移所有权模态框 */}
      <AnimatePresence>
        {showTransferOwnerModal && editingKBForPermission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTransferOwnerModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl shadow-2xl w-[480px] h-[600px] overflow-hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">转移所有权</h2>
                    <p className="text-sm text-slate-500 mt-0.5">选择新的所有者</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTransferOwnerModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* 搜索框 */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索用户名..."
                      value={transferSearchQuery}
                      onChange={(e) => setTransferSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 用户列表 */}
                <div className="space-y-2">
                  {[
                    { name: '张设计师', email: 'zhang@example.com', avatar: '张', color: 'from-purple-500 to-purple-600' },
                    { name: '李开发', email: 'li@example.com', avatar: '李', color: 'from-green-500 to-green-600' },
                    { name: '王产品', email: 'wang@example.com', avatar: '王', color: 'from-orange-500 to-orange-600' },
                    { name: '赵测试', email: 'zhao@example.com', avatar: '赵', color: 'from-pink-500 to-pink-600' },
                    { name: '刘运维', email: 'liu@example.com', avatar: '刘', color: 'from-indigo-500 to-indigo-600' },
                  ]
                    .filter(user => 
                      user.name.toLowerCase().includes(transferSearchQuery.toLowerCase()) ||
                      user.email.toLowerCase().includes(transferSearchQuery.toLowerCase())
                    )
                    .map((user) => (
                      <button
                        key={user.email}
                        onClick={() => {
                          setSelectedTransferUser(user.email);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left border-2 ${
                          selectedTransferUser === user.email
                            ? 'bg-blue-50 border-blue-500'
                            : 'hover:bg-slate-50 border-transparent'
                        }`}
                      >
                        <div className={`w-10 h-10 bg-gradient-to-br ${user.color} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                          {user.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{user.name}</div>
                          <div className="text-xs text-slate-500 truncate">{user.email}</div>
                        </div>
                        {selectedTransferUser === user.email && (
                          <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    ))}
                </div>

                {transferSearchQuery && [
                  { name: '张设计师', email: 'zhang@example.com', avatar: '张', color: 'from-purple-500 to-purple-600' },
                  { name: '李开发', email: 'li@example.com', avatar: '李', color: 'from-green-500 to-green-600' },
                  { name: '王产品', email: 'wang@example.com', avatar: '王', color: 'from-orange-500 to-orange-600' },
                  { name: '赵测试', email: 'zhao@example.com', avatar: '赵', color: 'from-pink-500 to-pink-600' },
                  { name: '刘运维', email: 'liu@example.com', avatar: '刘', color: 'from-indigo-500 to-indigo-600' },
                ]
                  .filter(user => 
                    user.name.toLowerCase().includes(transferSearchQuery.toLowerCase()) ||
                    user.email.toLowerCase().includes(transferSearchQuery.toLowerCase())
                  ).length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    未找到匹配的用户
                  </div>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => {
                    setShowTransferOwnerModal(false);
                    setSelectedTransferUser(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  取消
                </button>
                <button
                  disabled={!selectedTransferUser}
                  onClick={() => {
                    if (selectedTransferUser && editingKBForPermission) {
                      const selectedUser = [
                        { name: '张设计师', email: 'zhang@example.com' },
                        { name: '李开发', email: 'li@example.com' },
                        { name: '王产品', email: 'wang@example.com' },
                        { name: '赵测试', email: 'zhao@example.com' },
                        { name: '刘运维', email: 'liu@example.com' },
                      ].find(u => u.email === selectedTransferUser);
                      
                      if (selectedUser) {
                        // 更新知识库的创建者
                        setKnowledgeBases(prev => prev.map(kb => 
                          kb.id === editingKBForPermission.id 
                            ? { ...kb, creator: selectedUser.name }
                            : kb
                        ));
                        
                        // 更新编辑中的知识库
                        setEditingKBForPermission(prev => 
                          prev ? { ...prev, creator: selectedUser.name } : null
                        );
                        
                        showToast('success', `已将所有权转移给 ${selectedUser.name}`);
                      }
                    }
                    setShowTransferOwnerModal(false);
                    setSelectedTransferUser(null);
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    selectedTransferUser
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  确认转移
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 管理协作者模态框 */}
      <AnimatePresence>
        {showManageCollaboratorModal && editingKBForPermission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManageCollaboratorModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl shadow-2xl w-[800px] h-[700px] overflow-hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">管理协作者</h2>
                    <p className="text-sm text-slate-500 mt-0.5">添加成员或团队到知识库</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowManageCollaboratorModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 标签页切换 */}
              <div className="px-6 pt-4 border-b border-slate-200">
                <div className="flex gap-1">
                  <button
                    onClick={() => setCollaboratorTab('member')}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
                      collaboratorTab === 'member'
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    成员
                  </button>
                  <button
                    onClick={() => setCollaboratorTab('team')}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
                      collaboratorTab === 'team'
                        ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    团队
                  </button>
                </div>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* 搜索框 */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={collaboratorTab === 'member' ? '搜索成员...' : '搜索团队...'}
                      value={collaboratorSearchQuery}
                      onChange={(e) => setCollaboratorSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 已添加的协作者标题 */}
                <div className="mb-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">已添加的{collaboratorTab === 'member' ? '成员' : '团队'}</h3>
                </div>

                {/* 已添加的成员列表 */}
                {collaboratorTab === 'member' && (
                  <div className="space-y-2 mb-6 min-h-[180px]">
                    {addedMembers
                      .filter(user => 
                        user.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()) ||
                        user.email.toLowerCase().includes(collaboratorSearchQuery.toLowerCase())
                      )
                      .map((user) => (
                        <div
                          key={user.email}
                          className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                        >
                          <div className={`w-9 h-9 bg-gradient-to-br ${user.color} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                            {user.avatar}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800">{user.name}</div>
                            <div className="text-xs text-slate-500 truncate">{user.email}</div>
                          </div>
                          <select 
                            value={user.permission}
                            onChange={(e) => {
                              setAddedMembers(prev => prev.map(m => 
                                m.email === user.email ? { ...m, permission: e.target.value } : m
                              ));
                            }}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="read">读权限</option>
                            <option value="write">写权限</option>
                            <option value="admin">管理员</option>
                          </select>
                          <button
                            onClick={() => {
                              setAddedMembers(prev => prev.filter(m => m.email !== user.email));
                              showToast('success', `已移除 ${user.name}`);
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {/* 已添加的团队列表 */}
                {collaboratorTab === 'team' && (
                  <div className="space-y-2 mb-6 min-h-[180px]">
                    {addedTeams
                      .filter(team => 
                        team.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase())
                      )
                      .map((team) => (
                        <div
                          key={team.name}
                          className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                        >
                          <div className={`w-9 h-9 bg-gradient-to-br ${team.color} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                            {team.avatar}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800">{team.name}</div>
                            <div className="text-xs text-slate-500">{team.members} 名成员</div>
                          </div>
                          <select 
                            value={team.permission}
                            onChange={(e) => {
                              setAddedTeams(prev => prev.map(t => 
                                t.name === team.name ? { ...t, permission: e.target.value } : t
                              ));
                            }}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="read">读权限</option>
                            <option value="write">写权限</option>
                            <option value="admin">管理员</option>
                          </select>
                          <button
                            onClick={() => {
                              setAddedTeams(prev => prev.filter(t => t.name !== team.name));
                              showToast('success', `已移除 ${team.name}`);
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {/* 分隔线 */}
                <div className="border-t border-slate-200 my-4"></div>

                {/* 可添加的协作者标题 */}
                <div className="mb-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">添加{collaboratorTab === 'member' ? '成员' : '团队'}</h3>
                </div>

                {/* 可添加的成员列表 */}
                {collaboratorTab === 'member' && (
                  <div className="space-y-2 min-h-[200px]">
                    {[
                      { name: '王产品', email: 'wang@example.com', avatar: '王', color: 'from-orange-500 to-orange-600' },
                      { name: '赵测试', email: 'zhao@example.com', avatar: '赵', color: 'from-pink-500 to-pink-600' },
                      { name: '刘运维', email: 'liu@example.com', avatar: '刘', color: 'from-indigo-500 to-indigo-600' },
                      { name: '周前端', email: 'zhou@example.com', avatar: '周', color: 'from-cyan-500 to-cyan-600' },
                      { name: '吴后端', email: 'wu@example.com', avatar: '吴', color: 'from-teal-500 to-teal-600' },
                    ]
                      .filter(user => !addedMembers.some(m => m.email === user.email)) // 过滤已添加的成员
                      .filter(user => 
                        user.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()) ||
                        user.email.toLowerCase().includes(collaboratorSearchQuery.toLowerCase())
                      )
                      .map((user) => (
                        <div
                          key={user.email}
                          className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors border border-slate-200"
                        >
                          <div className={`w-9 h-9 bg-gradient-to-br ${user.color} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                            {user.avatar}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800">{user.name}</div>
                            <div className="text-xs text-slate-500 truncate">{user.email}</div>
                          </div>
                          <select 
                            defaultValue="read"
                            id={`member-permission-${user.email}`}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="read">读权限</option>
                            <option value="write">写权限</option>
                            <option value="admin">管理员</option>
                          </select>
                          <button
                            onClick={() => {
                              const selectElement = document.getElementById(`member-permission-${user.email}`) as HTMLSelectElement;
                              const permission = selectElement?.value || 'read';
                              setAddedMembers(prev => [...prev, { ...user, permission }]);
                              showToast('success', `已添加 ${user.name}`);
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            添加
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {/* 可添加的团队列表 */}
                {collaboratorTab === 'team' && (
                  <div className="space-y-2 min-h-[200px]">
                    {[
                      { 
                        name: '设计团队', 
                        members: 8, 
                        avatar: '设', 
                        color: 'from-purple-500 to-purple-600',
                        teamMembers: [
                          { id: 'design1', name: '张设计', email: 'zhang.design@example.com', color: 'from-purple-400 to-purple-500' },
                          { id: 'design2', name: '李UI', email: 'li.ui@example.com', color: 'from-pink-400 to-pink-500' },
                          { id: 'design3', name: '王UX', email: 'wang.ux@example.com', color: 'from-indigo-400 to-indigo-500' },
                        ]
                      },
                      { 
                        name: '产品团队', 
                        members: 6, 
                        avatar: '产', 
                        color: 'from-orange-500 to-orange-600',
                        teamMembers: [
                          { id: 'product1', name: '赵产品', email: 'zhao.pm@example.com', color: 'from-orange-400 to-orange-500' },
                          { id: 'product2', name: '钱经理', email: 'qian.pm@example.com', color: 'from-yellow-400 to-yellow-500' },
                        ]
                      },
                      { 
                        name: '测试团队', 
                        members: 10, 
                        avatar: '测', 
                        color: 'from-pink-500 to-pink-600',
                        teamMembers: [
                          { id: 'qa1', name: '孙测试', email: 'sun.qa@example.com', color: 'from-pink-400 to-pink-500' },
                          { id: 'qa2', name: '周QA', email: 'zhou.qa@example.com', color: 'from-rose-400 to-rose-500' },
                          { id: 'qa3', name: '吴自动化', email: 'wu.auto@example.com', color: 'from-red-400 to-red-500' },
                        ]
                      },
                      { 
                        name: '运维团队', 
                        members: 5, 
                        avatar: '运', 
                        color: 'from-indigo-500 to-indigo-600',
                        teamMembers: [
                          { id: 'ops1', name: '郑运维', email: 'zheng.ops@example.com', color: 'from-indigo-400 to-indigo-500' },
                          { id: 'ops2', name: '冯DevOps', email: 'feng.devops@example.com', color: 'from-blue-400 to-blue-500' },
                        ]
                      },
                    ]
                      .filter(team => !addedTeams.some(t => t.name === team.name)) // 过滤已添加的团队
                      .filter(team => 
                        team.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase())
                      )
                      .map((team) => (
                        <div
                          key={team.name}
                          className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors border border-slate-200"
                        >
                          <div className={`w-9 h-9 bg-gradient-to-br ${team.color} rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                            {team.avatar}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800">{team.name}</div>
                            <div className="text-xs text-slate-500">{team.members} 名成员</div>
                          </div>
                          <select 
                            defaultValue="read"
                            id={`team-permission-${team.name}`}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="read">读权限</option>
                            <option value="write">写权限</option>
                            <option value="admin">管理员</option>
                          </select>
                          <button
                            onClick={() => {
                              const selectElement = document.getElementById(`team-permission-${team.name}`) as HTMLSelectElement;
                              const permission = selectElement?.value || 'read';
                              
                              // 初始化成员权限
                              const memberPermissions: Record<string, string> = {};
                              team.teamMembers.forEach(member => {
                                memberPermissions[member.id] = permission;
                              });
                              
                              setAddedTeams(prev => [...prev, { 
                                ...team, 
                                permission,
                                expanded: false,
                                memberPermissions
                              }]);
                              showToast('success', `已添加 ${team.name}`);
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            添加
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {/* 空状态 - 搜索无结果 */}
                {collaboratorSearchQuery && 
                  ((collaboratorTab === 'member' && [
                    { name: '王产品', email: 'wang@example.com' },
                    { name: '赵测试', email: 'zhao@example.com' },
                    { name: '刘运维', email: 'liu@example.com' },
                    { name: '周前端', email: 'zhou@example.com' },
                    { name: '吴后端', email: 'wu@example.com' },
                  ]
                    .filter(user => 
                      user.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase()) ||
                      user.email.toLowerCase().includes(collaboratorSearchQuery.toLowerCase())
                    ).length === 0) ||
                  (collaboratorTab === 'team' && [
                    { name: '设计团队' },
                    { name: '产品团队' },
                    { name: '测试团队' },
                    { name: '运维团队' },
                  ]
                    .filter(team => 
                      team.name.toLowerCase().includes(collaboratorSearchQuery.toLowerCase())
                    ).length === 0)) && (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>未找到匹配的{collaboratorTab === 'member' ? '成员' : '团队'}</p>
                  </div>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => setShowManageCollaboratorModal(false)}
                  className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowManageCollaboratorModal(false);
                    showToast('success', '协作者配置已保存');
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 团队管理模态框 */}
      <AnimatePresence>
        {showManageTeamModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowManageTeamModal(false);
                setEditingTeam(null);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl shadow-2xl w-[700px] max-h-[80vh] overflow-hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">管理团队</h2>
                    <p className="text-sm text-slate-500 mt-0.5">创建、编辑和删除团队</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowManageTeamModal(false);
                    setEditingTeam(null);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* 编辑表单 */}
                {editingTeam && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">
                      {editingTeam.id ? '编辑团队' : '新建团队'}
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">团队名称</label>
                        <input
                          type="text"
                          value={editingTeam.name}
                          onChange={(e) => setEditingTeam({...editingTeam, name: e.target.value})}
                          placeholder="请输入团队名称"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!editingTeam.name.trim()) {
                              showToast('error', '请输入团队名称');
                              return;
                            }
                            if (editingTeam.id) {
                              // 编辑
                              setManagedTeams(managedTeams.map(t => 
                                t.id === editingTeam.id ? {...t, name: editingTeam.name} : t
                              ));
                              showToast('success', '团队已更新');
                            } else {
                              // 新建
                              const newTeam = {
                                id: 't' + Date.now(),
                                name: editingTeam.name,
                                memberCount: 0,
                                members: []
                              };
                              setManagedTeams([...managedTeams, newTeam]);
                              showToast('success', '团队已创建');
                            }
                            setEditingTeam(null);
                          }}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingTeam(null)}
                          className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-all"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 搜索和添加 */}
                <div className="flex gap-3 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索团队..."
                      value={teamSearchQuery}
                      onChange={(e) => setTeamSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setEditingTeam({ id: '', name: '', memberCount: 0, members: [] });
                    }}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    新建团队
                  </button>
                </div>

                {/* 团队列表 */}
                <div className="space-y-2">
                  {managedTeams
                    .filter(team => team.name.toLowerCase().includes(teamSearchQuery.toLowerCase()))
                    .map(team => {
                      const isExpanded = expandedManageTeamId === team.id;
                      return (
                    <div key={team.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-800">{team.name}</div>
                            <div className="text-xs text-slate-500">{team.memberCount} 名成员</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {team.members && team.members.length > 0 && (
                            <button
                              onClick={() => setExpandedManageTeamId(isExpanded ? null : team.id)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title={isExpanded ? "收起成员" : "查看成员"}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                          <button
                            onClick={() => setEditingTeam(team)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="编辑团队"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`确定要删除团队"${team.name}"吗？`)) {
                                setManagedTeams(managedTeams.filter(t => t.id !== team.id));
                                showToast('success', '团队已删除');
                              }
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="删除团队"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* 成员列表 - 只在展开时显示 */}
                      {isExpanded && team.members && team.members.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                          {team.members.map(member => (
                            <div key={member.id} className="flex items-center gap-2 text-xs text-slate-600 p-2 bg-white rounded-lg">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white text-xs font-medium">
                                {member.name.charAt(0)}
                              </div>
                              <span>{member.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )})}
                  {managedTeams.filter(team => team.name.toLowerCase().includes(teamSearchQuery.toLowerCase())).length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">没有找到团队</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="px-6 py-4 border-t border-slate-200">
                <button
                  onClick={() => {
                    setShowManageTeamModal(false);
                    setEditingTeam(null);
                  }}
                  className="w-full px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 成员管理模态框 */}
      <AnimatePresence>
        {showManageMemberModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowManageMemberModal(false);
                setEditingMember(null);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl shadow-2xl w-[700px] max-h-[80vh] overflow-hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <User className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">管理成员</h2>
                    <p className="text-sm text-slate-500 mt-0.5">添加、编辑和删除成员</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowManageMemberModal(false);
                    setEditingMember(null);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* 编辑表单 */}
                {editingMember && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">
                      {editingMember.id ? '编辑成员' : '新建成员'}
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">成员姓名</label>
                        <input
                          type="text"
                          value={editingMember.name}
                          onChange={(e) => setEditingMember({...editingMember, name: e.target.value})}
                          placeholder="请输入成员姓名"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">所属部门</label>
                        <input
                          type="text"
                          value={editingMember.department || ''}
                          onChange={(e) => setEditingMember({...editingMember, department: e.target.value})}
                          placeholder="请输入所属部门"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!editingMember.name.trim()) {
                              showToast('error', '请输入成员姓名');
                              return;
                            }
                            if (editingMember.id) {
                              // 编辑
                              setManagedMembers(managedMembers.map(m => 
                                m.id === editingMember.id ? {
                                  ...m, 
                                  name: editingMember.name,
                                  department: editingMember.department || '未分配'
                                } : m
                              ));
                              showToast('success', '成员已更新');
                            } else {
                              // 新建
                              const newMember = {
                                id: 'm' + Date.now(),
                                name: editingMember.name,
                                avatar: editingMember.name.charAt(0),
                                department: editingMember.department || '未分配'
                              };
                              setManagedMembers([...managedMembers, newMember]);
                              showToast('success', '成员已创建');
                            }
                            setEditingMember(null);
                          }}
                          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-all"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingMember(null)}
                          className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-all"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 搜索和添加 */}
                <div className="flex gap-3 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索成员姓名或部门..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setEditingMember({ id: '', name: '', avatar: '', department: '未分配' });
                    }}
                    className="px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-all flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    添加成员
                  </button>
                </div>

                {/* 成员列表 */}
                <div className="space-y-2">
                  {managedMembers
                    .filter(member => 
                      member.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                      (member.department && member.department.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                    )
                    .map(member => (
                    <div key={member.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-green-300 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-medium">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{member.name}</div>
                          <div className="text-xs text-slate-500">{member.department || '未分配'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingMember(member)}
                          className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="编辑成员"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`确定要删除成员"${member.name}"吗？`)) {
                              setManagedMembers(managedMembers.filter(m => m.id !== member.id));
                              showToast('success', '成员已删除');
                            }
                          }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除成员"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {managedMembers.filter(member => 
                    member.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                    (member.department && member.department.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                  ).length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">没有找到成员</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="px-6 py-4 border-t border-slate-200">
                <button
                  onClick={() => {
                    setShowManageMemberModal(false);
                    setEditingMember(null);
                  }}
                  className="w-full px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast 提示容器 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

