import { Exam } from "../types/exam";

export const mockExam: Exam = {
  id: "exam-001",
  title: "CS202: Advanced Algorithms and Data Structures",
  candidateName: "John Doe",
  candidateId: "CS24001",
  durationSeconds: 3 * 60 * 60,
  referenceMaterial: {
    title: "Exam Reference Sheet",
    sections: [
      {
        title: "Important Constants",
        items: [
          { type: "list", items: ["Speed of light (c) = 299,792,458 m/s", "Planck constant (h) = 6.62607015 × 10^-34 J⋅Hz^-1", "Avogadro constant (NA) = 6.02214076 × 10^23 mol^-1"] }
        ]
      },
      {
        title: "Probability & Statistics",
        items: [
          { type: "text", content: "Use the standard normal distribution table below for probability calculations." },
          { 
            type: "table", 
            headers: ["Distribution", "Parameter(s)", "Mean", "Variance"], 
            rows: [
              ["Normal", "μ, σ²", "μ", "σ²"],
              ["Binomial", "n, p", "np", "np(1-p)"],
              ["Poisson", "λ", "λ", "λ"]
            ] 
          }
        ]
      }
    ]
  },
  sections: [
    {
      id: "sec1",
      title: "Algorithms & Data Structures",
      referenceMaterial: {
        title: "Section Reference: Data Structures",
        sections: [
          {
            title: "Complexity Definitions",
            items: [
              { type: "text", content: "Assume all arrays are 0-indexed.\nLogarithms are base 2 unless otherwise specified: log2(x^y) = y * log2(x)." }
            ]
          }
        ]
      }
    }
  ],
  groups: [
    {
      id: "g1",
      title: "Comprehension: Graph Traversal",
      passage: "A researcher is studying network routing using a modified Breadth-First Search (BFS). In this network, all edges have weight 1, but some nodes are marked as 'high latency'. The BFS algorithm places high latency nodes at the back of a secondary queue.",
      codeSnippet: "function customBFS(startNode) {\n  let q = [startNode];\n  let secondaryQ = [];\n  // ...\n}",
      referenceMaterial: {
        title: "Group Reference Data",
        sections: [
          {
            title: "Network Assumptions",
            items: [
              { type: "text", content: "Assume the graph is unweighted except for latency delays.\nAll high latency nodes add exactly +1 queue delay." }
            ]
          }
        ]
      },
      questionIds: ["q3", "q4"]
    }
  ],
  questions: [
    {
      id: "q1",
      type: "MCQ",
      sectionId: "sec1",
      text: "What is the worst-case time complexity of inserting an element into a balanced binary search tree?",
      marks: 2,
      options: [
        { id: "o1", text: "O(1)" },
        { id: "o2", text: "O(log n)" },
        { id: "o3", text: "O(n)" },
        { id: "o4", text: "O(n log n)" }
      ]
    },
    {
      id: "q2",
      type: "MSQ",
      sectionId: "sec1",
      text: "Which of the following sorting algorithms are stable by default? (Select all that apply)",
      marks: 4,
      options: [
        { id: "o1", text: "Merge Sort" },
        { id: "o2", text: "Quick Sort" },
        { id: "o3", text: "Insertion Sort" },
        { id: "o4", text: "Heap Sort" }
      ]
    },
    {
      id: "q3",
      groupId: "g1",
      type: "MCQ",
      text: "If there are 5 high latency nodes connected directly to the start node, what is the maximum length of `secondaryQ` after the first iteration?",
      marks: 3,
      options: [
        { id: "o1", text: "1" },
        { id: "o2", text: "2" },
        { id: "o3", text: "5" },
        { id: "o4", text: "0" }
      ]
    },
    {
      id: "q4",
      groupId: "g1",
      type: "NUMERICAL",
      text: "Assume a graph with V=10 and E=15. How many iterations will the outer while-loop run if all nodes are reachable?",
      marks: 3
    },
    {
      id: "q5",
      type: "MCQ",
      text: "Identify the pattern in the given dataset plot.",
      marks: 2,
      imageUrl: "/diagram.svg",
      options: [
        { id: "o1", text: "Uniform Distribution" },
        { id: "o2", text: "Normal Distribution" },
        { id: "o3", text: "Bimodal Distribution" },
        { id: "o4", text: "Exponential Distribution" }
      ]
    },
    {
      id: "q6",
      type: "NUMERICAL",
      text: "What is the output of the following Python program?",
      marks: 5,
      codeSnippet: "def mystery(n):\n    if n <= 1: return 1\n    return n * mystery(n - 1)\n\nprint(mystery(5))"
    }
  ]
};
