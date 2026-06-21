import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { searchSimilarChunks, SearchMatch } from '@/lib/rag';
import { ENTERPRISE_GLOSSARY } from '@/lib/constants';
import { createAdminClient } from '@/lib/supabase-server';

export interface AgentToolContext {
  supabase: SupabaseClient;
  department: string;
  userId: string;
}

export interface AgentRunState {
  matches: SearchMatch[];
  toolsUsed: string[];
  escalationReason?: string;
}

export function createAgentTools(ctx: AgentToolContext, state: AgentRunState) {
  const documentRetrieval = new DynamicStructuredTool({
    name: 'document_retrieval',
    description:
      'Search enterprise documents using semantic vector search. Use for policy, SOP, runbook, and product documentation questions.',
    schema: z.object({
      query: z.string().describe('The search query to find relevant document passages'),
      domain: z
        .string()
        .optional()
        .describe('Optional department domain: HR, Engineering, Finance, Legal, Marketing, General'),
    }),
    func: async ({ query, domain }) => {
      state.toolsUsed.push('document_retrieval');
      const searchDept = domain || ctx.department;
      const matches = await searchSimilarChunks(ctx.supabase, query, searchDept, 5, 0.25);
      state.matches = matches;

      if (matches.length === 0) {
        return 'No matching documents found for this query in the accessible knowledge base.';
      }

      return matches
        .map((m, idx) => {
          const page = m.metadata.pageNumber ? `Page ${m.metadata.pageNumber}` : 'N/A';
          return `[Source ${idx + 1}] ${m.document_name} (${page}, similarity: ${m.similarity.toFixed(2)})\n${m.content}`;
        })
        .join('\n\n---\n\n');
    },
  });

  const metadataLookup = new DynamicStructuredTool({
    name: 'metadata_lookup',
    description: 'Look up document metadata such as owner, version, source system, sensitivity, and department.',
    schema: z.object({
      documentName: z.string().optional().describe('Partial or full document name to search'),
      department: z.string().optional().describe('Filter by department'),
    }),
    func: async ({ documentName, department }) => {
      state.toolsUsed.push('metadata_lookup');
      let query = ctx.supabase
        .from('documents')
        .select(
          'id, name, department, file_type, source_system, owner, sensitivity_label, version, source_updated_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(10);

      if (documentName) {
        query = query.ilike('name', `%${documentName}%`);
      }
      if (department) {
        query = query.eq('department', department);
      }

      const { data, error } = await query;
      if (error) return `Metadata lookup failed: ${error.message}`;
      if (!data?.length) return 'No documents matched the metadata query.';

      return data
        .map(
          (d) =>
            `- ${d.name} | dept: ${d.department} | source: ${d.source_system} | version: ${d.version} | sensitivity: ${d.sensitivity_label} | owner: ${d.owner || 'N/A'}`
        )
        .join('\n');
    },
  });

  const glossaryLookup = new DynamicStructuredTool({
    name: 'glossary_lookup',
    description: 'Look up enterprise acronyms and glossary terms.',
    schema: z.object({
      term: z.string().describe('The acronym or term to define'),
    }),
    func: async ({ term }) => {
      state.toolsUsed.push('glossary_lookup');
      const key = term.trim().toUpperCase();
      const definition = ENTERPRISE_GLOSSARY[key] || ENTERPRISE_GLOSSARY[term.trim()];
      if (!definition) {
        return `No glossary entry found for "${term}". Try document_retrieval for context.`;
      }
      return `${key}: ${definition}`;
    },
  });

  const escalateToHuman = new DynamicStructuredTool({
    name: 'escalate_to_human',
    description:
      'Escalate to a human knowledge owner for legal interpretation, HR-sensitive matters, or when documents are insufficient.',
    schema: z.object({
      reason: z.string().describe('Why human review is needed'),
      domain: z.string().optional().describe('Department domain for routing'),
    }),
    func: async ({ reason, domain }) => {
      state.toolsUsed.push('escalate_to_human');
      state.escalationReason = reason;

      const admin = createAdminClient();
      await admin.from('flagged_responses').insert({
        user_id: ctx.userId,
        question: reason,
        response: 'Pending human review — agent escalated this query.',
        reason,
        domain: domain || ctx.department,
        status: 'pending',
      });

      return `Escalated to ${domain || ctx.department} knowledge owner. A human reviewer will follow up. Reason: ${reason}`;
    },
  });

  return [documentRetrieval, metadataLookup, glossaryLookup, escalateToHuman];
}
