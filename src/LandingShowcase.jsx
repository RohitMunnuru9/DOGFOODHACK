export default function LandingShowcase() {
  return <section className="clay-landing-showcase" id="watch-demo" aria-labelledby="tour-heading">
    <div className="clay-tour-heading"><div><span className="clay-eyebrow">SEE IT IN ACTION</span><h2 id="tour-heading">From first idea to final applause.</h2></div><p>A walkthrough of the real workspace: build a team, submit your project, review the work, and share the results.</p></div>
    <div className="clay-tour-video">
      <video controls playsInline preload="none" poster="/landing/demo-poster.jpg" aria-label="DOGFOOD workspace walkthrough">
        <source src="/landing/demo.mp4" type="video/mp4"/>
        <track kind="captions" src="/landing/demo.vtt" srcLang="en" label="English"/>
        Your browser cannot play this video. <a href="/landing/demo.mp4">Download the walkthrough</a>.
      </video>
    </div>
    <div className="clay-tour-meta"><span>Real app footage · On-screen explanations · No audio</span><a href="/landing/demo.mp4" download>Download the walkthrough ↗</a></div>
    <div className="clay-landing-detail">
      <img src="/landing/judging-clay.png" alt="Clay project cards with sage checkmarks and a small award rosette" width="1536" height="1024" loading="lazy"/>
      <div><span className="clay-eyebrow">ROOM FOR THE WHOLE JOURNEY</span><h2>Built together.<br/>Judged thoughtfully.</h2>
        <ul><li><strong>Your work, in one place.</strong><p>Teams, drafts, project stories, and the links that bring an idea to life.</p></li><li><strong>A clear path to results.</strong><p>Private reviews, weighted criteria, progress tracking, and published scores.</p></li><li><strong>A little room to play.</strong><p>Take a break with six arcade games, then return to your workspace.</p></li></ul>
        <a className="dogfood-secondary" href="/projects">Explore the public gallery ↗</a>
      </div>
    </div>
  </section>;
}
