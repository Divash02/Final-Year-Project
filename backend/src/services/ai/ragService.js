import { executeAIReasoning } from "./aiProvider.js";
import { logAIActivity } from "./aiActivityService.js";

/**
 * CollegeOS Knowledge Assistant (RAG Engine)
 *
 * Implements Section 8 of CollegeOS Master Prompt.
 * Modular document retrieval over institutional policies and student handbooks.
 * Enforces role-based document access, provides transparent citations,
 * and states clearly when information cannot be found.
 */

export const INSTITUTIONAL_POLICY_COLLECTION = [
  {
    id: "POL-ACAD-01",
    title: "CollegeOS Academic Regulations & Credit Framework",
    category: "ACADEMIC",
    version: "2083.1",
    allowedRoles: ["student", "faculty", "hod", "program_coordinator", "dean", "registrar", "super_admin"],
    sections: [
      {
        section: "Section 2.1: Credit Requirements for Graduation",
        content:
          "To be eligible for the award of the Bachelor's degree (BCA/BIT), a candidate must successfully complete 126 credit hours across 8 semesters with a cumulative grade point average (CGPA) of at least 2.0 on a 4.0 scale.",
      },
      {
        section: "Section 3.4: Course Add/Drop Period",
        content:
          "Students may add or drop elective courses up to the end of the second academic week of each semester with formal approval from their Program Coordinator.",
      },
    ],
  },
  {
    id: "POL-EXAM-02",
    title: "University Examination & Assessment Guidelines",
    category: "EXAMINATION",
    version: "2083.2",
    allowedRoles: ["student", "faculty", "exam_officer", "hod", "registrar", "super_admin"],
    sections: [
      {
        section: "Section 4.2: Examination Eligibility & Attendance Rule",
        content:
          "A candidate must achieve a minimum of 75% attendance in each enrolled theory and practical subject to be issued an examination admit card. Students falling between 60% and 74% may petition the Academic Council with verifiable medical or emergency documentation.",
      },
      {
        section: "Section 5.1: Minimum Passing Standard",
        content:
          "The minimum passing score for semester-end written examinations is 40% aggregate in each individual subject module.",
      },
      {
        section: "Section 7.3: Retotalling & Result Appeal Process",
        content:
          "A student dissatisfied with their published marks may apply for official retotalling within 15 calendar days of official result publication by submitting a formal retotalling case with the Examination Division.",
      },
    ],
  },
  {
    id: "POL-FIN-03",
    title: "Tuition Fees, Deadlines & Payment Policy",
    category: "FINANCIAL",
    version: "2083.1",
    allowedRoles: ["student", "parent", "finance_officer", "super_admin"],
    sections: [
      {
        section: "Section 1.3: Payment Installments and Due Dates",
        content:
          "Semester tuition fees must be cleared in two equal installments: the first installment prior to semester registration, and the final balance at least 14 days before the semester examination date. Late payments incur a late fee of NPR 100 per week.",
      },
      {
        section: "Section 3.1: Examination Financial Clearance Hold",
        content:
          "Students with uncleared overdue balances exceeding NPR 5,000 will have an automated financial hold placed on their semester examination admit card until settled or approved by the Finance Officer.",
      },
    ],
  },
  {
    id: "POL-ADM-04",
    title: "Admissions Eligibility and Transfer Policy",
    category: "ADMISSION",
    version: "2083.1",
    allowedRoles: ["student", "registrar", "super_admin"],
    sections: [
      {
        section: "Section 2.1: Minimum Secondary Requirements",
        content:
          "Applicants for Bachelor of Computer Applications (BCA) must have passed Grade 12 (or equivalent 10+2) with a minimum aggregate GPA of 2.0 or 45% marks, with Mathematics or Computer Science as a completed subject.",
      },
    ],
  },
  {
    id: "POL-LEAVE-05",
    title: "Student Leave & Medical Absence Procedures",
    category: "STUDENT_AFFAIRS",
    version: "2083.1",
    allowedRoles: ["student", "faculty", "hod", "campus_admin", "super_admin"],
    sections: [
      {
        section: "Section 1.2: Medical Absence Verification",
        content:
          "Absences exceeding three consecutive lecture days due to medical reasons must be accompanied by a hospital medical discharge summary and submitted via the Student Request portal within 5 days of resuming classes.",
      },
    ],
  },
];

const STOP_WORDS = new Set([
  "what", "is", "the", "for", "and", "are", "can", "how", "why", "does", "with", "from",
  "that", "this", "our", "you", "your", "who", "when", "where", "which", "any", "all",
  "per", "not", "out", "was", "has", "had", "have", "been", "will", "may", "about", "into"
]);

/**
 * Perform keyword-weighted document passage retrieval respecting role permissions.
 */
export function retrievePolicyPassages(query, userRole) {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  const matchedPassages = [];

  for (const doc of INSTITUTIONAL_POLICY_COLLECTION) {
    // Enforce role-based document access
    if (!doc.allowedRoles.includes(userRole)) {
      continue;
    }

    for (const sec of doc.sections) {
      const textToSearch = `${doc.title} ${sec.section} ${sec.content}`.toLowerCase();
      let matchScore = 0;
      for (const term of queryTerms) {
        if (textToSearch.includes(term)) {
          matchScore += 1;
        }
      }

      if (matchScore > 0) {
        matchedPassages.push({
          documentId: doc.id,
          documentTitle: doc.title,
          sectionTitle: sec.section,
          passage: sec.content,
          score: matchScore,
        });
      }
    }
  }

  // Sort passages by relevance score
  matchedPassages.sort((a, b) => b.score - a.score);
  return matchedPassages.slice(0, 3);
}

/**
 * Answer an institutional policy query with verified citations.
 */
export async function queryKnowledgeAssistant({ user, role, query }) {
  const retrieved = retrievePolicyPassages(query, role);

  if (retrieved.length === 0) {
    const answer =
      "I could not locate an approved institutional regulation or policy document answering your specific query within your authorized role scope. Please consult your Program Coordinator or the Registrar's Office.";

    await logAIActivity({
      user,
      role,
      module: "rag_assistant",
      requestCategory: "POLICY_KNOWLEDGE_QUERY",
      queryPrompt: query,
      recommendation: answer,
      executionLatencyMs: 10,
    });

    return {
      answer,
      citations: [],
      found: false,
    };
  }

  const contextData = {
    userQuery: query,
    retrievedPassages: retrieved.map((r) => ({
      document: r.documentTitle,
      section: r.sectionTitle,
      text: r.passage,
    })),
  };

  const aiRes = await executeAIReasoning({
    systemInstruction:
      "You are the CollegeOS Institutional Knowledge Assistant. Answer the question using ONLY the provided verified policy passages. Always cite the document and section explicitly. If the passage does not contain the answer, state that honestly.",
    userPrompt: query,
    contextData,
    fallbackSynthesis: `${retrieved[0].passage} (Source: ${retrieved[0].documentTitle}, ${retrieved[0].sectionTitle})`,
  });

  await logAIActivity({
    user,
    role,
    module: "rag_assistant",
    requestCategory: "POLICY_KNOWLEDGE_QUERY",
    queryPrompt: query,
    sourceRecords: retrieved.map((r) => ({
      collectionName: "PolicyDocument",
      recordId: r.documentId,
      label: `${r.documentTitle} (${r.sectionTitle})`,
      identifier: r.documentId,
    })),
    recommendation: aiRes.text,
    executionLatencyMs: 25,
  });

  return {
    answer: aiRes.text,
    citations: retrieved.map((r) => ({
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      section: r.sectionTitle,
      excerpt: r.passage,
    })),
    found: true,
  };
}
