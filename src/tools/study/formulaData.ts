// Formula sheets for secondary school (S1–S6). LaTeX for KaTeX. Bundled so they work
// offline; heads of department can later publish their own sheets (plan §7, P5).
export type Subject = "maths" | "physics" | "chemistry" | "biology";

export interface Formula {
  subject: Subject;
  topic: string;
  name: string;
  tex: string;
  /** What the letters mean / when to use it. */
  note?: string;
  level: "S1–S3" | "S4–S6";
}

const F = (subject: Subject, level: Formula["level"], topic: string, name: string, tex: string, note?: string): Formula => ({ subject, topic, name, tex, note, level });

export const FORMULAS: Formula[] = [
  // ── Mathematics ──
  F("maths", "S1–S3", "Algebra", "Difference of two squares", "a^2 - b^2 = (a-b)(a+b)"),
  F("maths", "S1–S3", "Algebra", "Perfect squares", "(a \\pm b)^2 = a^2 \\pm 2ab + b^2"),
  F("maths", "S1–S3", "Algebra", "Quadratic formula", "x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", "Roots of ax² + bx + c = 0"),
  F("maths", "S4–S6", "Algebra", "Discriminant", "\\Delta = b^2 - 4ac", "Δ > 0: two real roots · Δ = 0: one · Δ < 0: none"),
  F("maths", "S4–S6", "Algebra", "Sum and product of roots", "\\alpha + \\beta = -\\dfrac{b}{a}, \\quad \\alpha\\beta = \\dfrac{c}{a}"),
  F("maths", "S1–S3", "Indices", "Laws of indices", "a^m a^n = a^{m+n}, \\quad \\dfrac{a^m}{a^n} = a^{m-n}, \\quad (a^m)^n = a^{mn}"),
  F("maths", "S1–S3", "Indices", "Zero and negative powers", "a^0 = 1, \\quad a^{-n} = \\dfrac{1}{a^n}, \\quad a^{\\frac{m}{n}} = \\sqrt[n]{a^m}"),
  F("maths", "S4–S6", "Logarithms", "Laws of logarithms", "\\log(ab) = \\log a + \\log b, \\quad \\log\\dfrac{a}{b} = \\log a - \\log b, \\quad \\log a^n = n\\log a"),
  F("maths", "S4–S6", "Logarithms", "Change of base", "\\log_b a = \\dfrac{\\log_c a}{\\log_c b}"),
  F("maths", "S4–S6", "Sequences", "Arithmetic progression", "u_n = a + (n-1)d, \\quad S_n = \\dfrac{n}{2}\\left[2a + (n-1)d\\right]"),
  F("maths", "S4–S6", "Sequences", "Geometric progression", "u_n = ar^{n-1}, \\quad S_n = \\dfrac{a(1-r^n)}{1-r}, \\quad S_\\infty = \\dfrac{a}{1-r}\\ (|r|<1)"),
  F("maths", "S1–S3", "Geometry", "Pythagoras", "a^2 + b^2 = c^2", "c is the hypotenuse"),
  F("maths", "S1–S3", "Geometry", "Area of a triangle", "A = \\tfrac{1}{2}bh = \\tfrac{1}{2}ab\\sin C"),
  F("maths", "S1–S3", "Geometry", "Circle", "C = 2\\pi r, \\quad A = \\pi r^2"),
  F("maths", "S1–S3", "Geometry", "Arc length and sector area", "s = r\\theta, \\quad A = \\tfrac{1}{2}r^2\\theta", "θ in radians"),
  F("maths", "S1–S3", "Mensuration", "Cylinder", "V = \\pi r^2 h, \\quad A = 2\\pi r^2 + 2\\pi rh"),
  F("maths", "S1–S3", "Mensuration", "Cone and sphere", "V_{\\text{cone}} = \\tfrac{1}{3}\\pi r^2 h, \\quad V_{\\text{sphere}} = \\tfrac{4}{3}\\pi r^3, \\quad A_{\\text{sphere}} = 4\\pi r^2"),
  F("maths", "S1–S3", "Trigonometry", "SOH CAH TOA", "\\sin\\theta = \\dfrac{O}{H}, \\quad \\cos\\theta = \\dfrac{A}{H}, \\quad \\tan\\theta = \\dfrac{O}{A}"),
  F("maths", "S4–S6", "Trigonometry", "Sine rule", "\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C}"),
  F("maths", "S4–S6", "Trigonometry", "Cosine rule", "a^2 = b^2 + c^2 - 2bc\\cos A"),
  F("maths", "S4–S6", "Trigonometry", "Identities", "\\sin^2\\theta + \\cos^2\\theta = 1, \\quad \\tan\\theta = \\dfrac{\\sin\\theta}{\\cos\\theta}"),
  F("maths", "S4–S6", "Trigonometry", "Double angle", "\\sin 2\\theta = 2\\sin\\theta\\cos\\theta, \\quad \\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta"),
  F("maths", "S1–S3", "Coordinate geometry", "Gradient and line", "m = \\dfrac{y_2 - y_1}{x_2 - x_1}, \\quad y - y_1 = m(x - x_1)"),
  F("maths", "S1–S3", "Coordinate geometry", "Distance and midpoint", "d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}, \\quad M = \\left(\\tfrac{x_1+x_2}{2}, \\tfrac{y_1+y_2}{2}\\right)"),
  F("maths", "S4–S6", "Coordinate geometry", "Circle equation", "(x-a)^2 + (y-b)^2 = r^2", "Centre (a, b), radius r"),
  F("maths", "S4–S6", "Calculus", "Power rule", "\\dfrac{d}{dx}x^n = nx^{n-1}, \\quad \\int x^n\\,dx = \\dfrac{x^{n+1}}{n+1} + C\\ (n \\ne -1)"),
  F("maths", "S4–S6", "Calculus", "Product and quotient rules", "(uv)' = u'v + uv', \\quad \\left(\\dfrac{u}{v}\\right)' = \\dfrac{u'v - uv'}{v^2}"),
  F("maths", "S4–S6", "Calculus", "Chain rule", "\\dfrac{dy}{dx} = \\dfrac{dy}{du}\\cdot\\dfrac{du}{dx}"),
  F("maths", "S4–S6", "Calculus", "Standard derivatives", "(\\sin x)' = \\cos x, \\quad (\\cos x)' = -\\sin x, \\quad (e^x)' = e^x, \\quad (\\ln x)' = \\dfrac{1}{x}"),
  F("maths", "S1–S3", "Statistics", "Mean", "\\bar{x} = \\dfrac{\\sum x}{n} = \\dfrac{\\sum fx}{\\sum f}"),
  F("maths", "S4–S6", "Statistics", "Variance and standard deviation", "\\sigma^2 = \\dfrac{\\sum (x-\\bar{x})^2}{n} = \\dfrac{\\sum x^2}{n} - \\bar{x}^2, \\quad \\sigma = \\sqrt{\\sigma^2}"),
  F("maths", "S1–S3", "Probability", "Probability rules", "P(A \\cup B) = P(A) + P(B) - P(A \\cap B), \\quad P(A') = 1 - P(A)"),
  F("maths", "S4–S6", "Probability", "Permutations and combinations", "{}^nP_r = \\dfrac{n!}{(n-r)!}, \\quad {}^nC_r = \\dfrac{n!}{r!\\,(n-r)!}"),
  F("maths", "S1–S3", "Finance", "Simple and compound interest", "I = \\dfrac{PRT}{100}, \\quad A = P\\left(1 + \\dfrac{r}{100}\\right)^n"),
  // ── Physics ──
  F("physics", "S1–S3", "Kinematics", "Speed and velocity", "v = \\dfrac{d}{t}, \\quad a = \\dfrac{v - u}{t}"),
  F("physics", "S4–S6", "Kinematics", "Equations of motion (constant a)", "v = u + at, \\quad s = ut + \\tfrac{1}{2}at^2, \\quad v^2 = u^2 + 2as, \\quad s = \\tfrac{(u+v)}{2}t"),
  F("physics", "S1–S3", "Forces", "Newton's second law", "F = ma", "F in N, m in kg, a in m/s²"),
  F("physics", "S1–S3", "Forces", "Weight", "W = mg", "g ≈ 9.8 m/s² (10 m/s² in many exam questions)"),
  F("physics", "S4–S6", "Forces", "Momentum and impulse", "p = mv, \\quad F\\Delta t = \\Delta p"),
  F("physics", "S1–S3", "Forces", "Moment of a force", "M = F \\times d", "d: perpendicular distance from the pivot"),
  F("physics", "S1–S3", "Energy", "Work, power, efficiency", "W = Fd, \\quad P = \\dfrac{W}{t}, \\quad \\eta = \\dfrac{\\text{useful output}}{\\text{input}} \\times 100\\%"),
  F("physics", "S1–S3", "Energy", "Kinetic and potential energy", "E_k = \\tfrac{1}{2}mv^2, \\quad E_p = mgh"),
  F("physics", "S1–S3", "Matter", "Density and pressure", "\\rho = \\dfrac{m}{V}, \\quad P = \\dfrac{F}{A}, \\quad P = \\rho g h"),
  F("physics", "S4–S6", "Matter", "Hooke's law", "F = ke"),
  F("physics", "S1–S3", "Heat", "Heat capacity and latent heat", "Q = mc\\Delta T, \\quad Q = mL"),
  F("physics", "S4–S6", "Heat", "Gas laws", "P_1V_1 = P_2V_2, \\quad \\dfrac{V_1}{T_1} = \\dfrac{V_2}{T_2}, \\quad \\dfrac{P_1V_1}{T_1} = \\dfrac{P_2V_2}{T_2}", "T in kelvin"),
  F("physics", "S1–S3", "Waves", "Wave equation", "v = f\\lambda, \\quad f = \\dfrac{1}{T}"),
  F("physics", "S4–S6", "Light", "Refraction and lenses", "n = \\dfrac{\\sin i}{\\sin r}, \\quad \\dfrac{1}{f} = \\dfrac{1}{u} + \\dfrac{1}{v}, \\quad m = \\dfrac{v}{u}"),
  F("physics", "S1–S3", "Electricity", "Charge, current and Ohm's law", "Q = It, \\quad V = IR"),
  F("physics", "S1–S3", "Electricity", "Electrical power and energy", "P = VI = I^2R = \\dfrac{V^2}{R}, \\quad E = Pt"),
  F("physics", "S1–S3", "Electricity", "Resistors in series and parallel", "R_s = R_1 + R_2 + \\dots, \\quad \\dfrac{1}{R_p} = \\dfrac{1}{R_1} + \\dfrac{1}{R_2} + \\dots"),
  F("physics", "S4–S6", "Electricity", "Capacitors", "Q = CV, \\quad E = \\tfrac{1}{2}CV^2"),
  F("physics", "S4–S6", "Electromagnetism", "Transformer", "\\dfrac{V_s}{V_p} = \\dfrac{N_s}{N_p}", "Ideal: V_p I_p = V_s I_s"),
  F("physics", "S4–S6", "Circular motion", "Centripetal force", "F = \\dfrac{mv^2}{r} = m\\omega^2 r, \\quad v = \\omega r"),
  F("physics", "S4–S6", "Gravitation", "Newton's law of gravitation", "F = \\dfrac{G m_1 m_2}{r^2}", "G = 6.67 × 10⁻¹¹ N m² kg⁻²"),
  F("physics", "S4–S6", "Modern physics", "Photon energy", "E = hf = \\dfrac{hc}{\\lambda}", "h = 6.63 × 10⁻³⁴ J s"),
  F("physics", "S4–S6", "Modern physics", "Radioactive decay", "N = N_0\\left(\\tfrac{1}{2}\\right)^{t/T_{1/2}}"),
  // ── Chemistry ──
  F("chemistry", "S1–S3", "Moles", "Amount of substance", "n = \\dfrac{m}{M}", "n in mol, m in g, M in g/mol"),
  F("chemistry", "S1–S3", "Moles", "Avogadro's number", "N = n \\times N_A, \\quad N_A = 6.02 \\times 10^{23}\\ \\text{mol}^{-1}"),
  F("chemistry", "S1–S3", "Moles", "Concentration", "c = \\dfrac{n}{V}", "c in mol/dm³, V in dm³"),
  F("chemistry", "S1–S3", "Moles", "Molar gas volume", "V = n \\times 24\\ \\text{dm}^3", "At room temperature and pressure (22.4 dm³ at STP)"),
  F("chemistry", "S4–S6", "Gases", "Ideal gas equation", "PV = nRT", "R = 8.31 J mol⁻¹ K⁻¹, T in K, P in Pa, V in m³"),
  F("chemistry", "S1–S3", "Calculations", "Percentage yield and purity", "\\%\\ \\text{yield} = \\dfrac{\\text{actual}}{\\text{theoretical}} \\times 100, \\quad \\%\\ \\text{purity} = \\dfrac{\\text{pure mass}}{\\text{sample mass}} \\times 100"),
  F("chemistry", "S1–S3", "Calculations", "Percentage by mass", "\\%\\ X = \\dfrac{n_X \\times A_r(X)}{M_r} \\times 100"),
  F("chemistry", "S4–S6", "Titration", "Titration", "\\dfrac{c_1V_1}{n_1} = \\dfrac{c_2V_2}{n_2}", "n: mole ratio from the balanced equation"),
  F("chemistry", "S4–S6", "Acids and bases", "pH", "\\text{pH} = -\\log[\\text{H}^+], \\quad \\text{pH} + \\text{pOH} = 14", "At 25 °C"),
  F("chemistry", "S4–S6", "Energetics", "Enthalpy change", "q = mc\\Delta T, \\quad \\Delta H = -\\dfrac{q}{n}"),
  F("chemistry", "S4–S6", "Energetics", "Hess's law", "\\Delta H_r = \\sum \\Delta H_f(\\text{products}) - \\sum \\Delta H_f(\\text{reactants})"),
  F("chemistry", "S4–S6", "Kinetics", "Rate of reaction", "\\text{rate} = \\dfrac{\\Delta[\\text{concentration}]}{\\Delta t}, \\quad \\text{rate} = k[A]^m[B]^n"),
  F("chemistry", "S4–S6", "Equilibrium", "Equilibrium constant", "K_c = \\dfrac{[C]^c[D]^d}{[A]^a[B]^b}", "For aA + bB ⇌ cC + dD"),
  F("chemistry", "S4–S6", "Electrochemistry", "Faraday's law", "Q = It, \\quad n(e^-) = \\dfrac{Q}{F}, \\quad F = 96\\,500\\ \\text{C mol}^{-1}"),
  // ── Biology ──
  F("biology", "S1–S3", "Microscopy", "Magnification", "M = \\dfrac{\\text{image size}}{\\text{actual size}}"),
  F("biology", "S4–S6", "Cells", "Surface area to volume ratio", "\\text{ratio} = \\dfrac{\\text{surface area}}{\\text{volume}}"),
  F("biology", "S4–S6", "Genetics", "Hardy–Weinberg", "p + q = 1, \\quad p^2 + 2pq + q^2 = 1"),
  F("biology", "S4–S6", "Ecology", "Lincoln index (mark–recapture)", "N = \\dfrac{n_1 \\times n_2}{m_2}", "n₁ marked, n₂ caught later, m₂ marked in the second catch"),
  F("biology", "S4–S6", "Physiology", "Cardiac output", "CO = SV \\times HR"),
  F("biology", "S1–S3", "Growth", "Percentage change", "\\%\\ \\text{change} = \\dfrac{\\text{new} - \\text{old}}{\\text{old}} \\times 100"),
];

/** Every word must match (name, topic, note or TeX); accents and case ignored. */
export function searchFormulas(list: Formula[], query: string): Formula[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((f) => {
    const hay = fold(`${f.name} ${f.topic} ${f.note ?? ""} ${f.tex}`);
    return words.every((w) => hay.includes(w));
  });
}
