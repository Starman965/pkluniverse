import { useParams } from 'react-router-dom';

export default function TeamPageTemplate({ description, nextSteps, title }) {
  const { clubSlug, teamSlug } = useParams();

  return (
    <div className="page-grid">
      <section className="card">
        <p className="eyebrow">
          {clubSlug} / {teamSlug}
        </p>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      <section className="card">
        <p className="eyebrow">Next implementation step</p>
        <ul className="feature-list">
          {nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
