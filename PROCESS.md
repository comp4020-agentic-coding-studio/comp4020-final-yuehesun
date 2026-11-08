# What I built

**Laundry Queue** is a shared queue for a student residence's laundry
machines — see [`README.md`](README.md) for the "good" argument and
[`plan.md`](plan.md#user-story) for the user story it's built from.
Crit 8 shipped a working, persistent app with one machine type; crit 9
added real-time sync; crit 10 added logging, then an extension making
the fairness rules checkable at real scale with seeded scenarios, not
just argued in words. A later addition, prompted by course feedback,
added a first-person 3D walkthrough with real, scannable per-machine QR
codes.

# Process overview

The first step was choosing the project and planning its design. the agent first suggested three generic ideas and
a co-op-game direction, all rejected
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab))
. I eventually started from a frustration in my own daily life: wasting time waiting for laundry machines in my student residence. I chose Laundry Queue as a way to address this problem. The agent's initial plan was not satisfactory either. It was only after I worked through the actual scenarios myself and explained them step by step that the plan gradually matched my expectations
([`1323937`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/1323937),
`docs/adr/0001-app-concept.md`). Through this process, I gradually clarified the division of responsibility between myself and the agent: once decisions had been made, the agent could implement them and reason about them, but deciding what problem to solve and what the application should eventually become remained my responsibility.

During development, I experimented with different ways of managing the agent. One example was the workflow documented in CLAUDE.md: breaking the overall plan into smaller stages, with each stage starting from planning and requiring manual testing before it could be considered complete. I also experimented with unattended runs. After trying one during a tutorial riff session, I decided to apply the approach to Crit 10's extension. I first wrote down every decision the agent needed to follow, including identity, the harness, in-page alerts, and why there should be no separate results board. I recorded these decisions in ADRs and used an "Unattended runs" section in CLAUDE.md to guide the process. I then prepared a prompt.md designed to let Claude work independently for two hours, instructing it to verify its own work against specifications and screenshots
([`95bc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/95bc7e7),
[`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
It produced a home page that actually looked considered
([`8402c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8402c26)),
cheaper than my usual back-and-forth.

After this experience, I used the unattended approach again to build the simulation page. This was an important attempt to simulate realistic usage at an earlier stage of the project. In Crit 9, I changed the missed-window rule from "miss your window, get ejected" to "move back one place". The reasoning behind this decision was documented in docs/adr/0005, but it was still only a theoretical argument. I wanted to test how the system would work in actual use. Since I could not connect the system to real washing machines, I came up with the idea of using seeded data to simulate realistic usage at scale: 100 residents over a full day. That's what /simulation does — it provides an animation showing the results of three different queueing strategies at realistic scale([`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59))。Running the
unning the full simulation batch hung my machine twice. The agent initially thought the problem was caused by its own background-task handling. However, I did not simply accept its explanation. I opened a second terminal and ran the simulation script independently, without involving the agent. The same crash occurred again. This ruled out the agent's background process and directed my attention to the simulation script itself. I eventually found that the script never yielded control while processing its 150 seeds. Through manual testing and debugging, I was able to fix the issue and get the simulation working successfully([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913))。However, at this stage, the simulation was still limited to testing at the data level. I had always felt that the project was not sufficiently connected to a real use case.


Not long afterwards, a tutor reviewing the deployed app raised a concern: simulated results alone might not be convincing enough to persuade a hall manager to adopt the system. He suggested building a 3D walkthrough of the laundry room, where users could scan the real QR codes on virtual washing machines and go directly to their own homepage. This was an angle I had never considered before. I found the idea very interesting and immediately started trying to build it. However, turning an interesting idea into a working feature was not that straightforward, and many practical problems emerged along the way. When Building the 3D room, I found the character standing still while the
agent's checks called it working as intended. I didn't accept the agent's first explanation, and had it swap in a
simpler, bone-free placeholder instead — if that moved and the real
one didn't, the bug was specific to the rigged model. It moved,
narrowing the cause to the model-copying code sharing one skeleton
across every clone, so the bones never tracked a position variable
that had been correct all along
([`8e33e09`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8e33e09)).
A later camera bug followed a similar pattern — a "fix" whose symptom
proved unchanged the moment I tried it, resolved only once I insisted
on a full re-check, not another tuning pass
([`935bad5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/935bad5)).
A clean-looking check was never proof; re-testing the symptom caught
an incomplete fix each time.
 
After several days of work, I finally managed to deploy the 3D laundry room online([`060c6f7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/060c6f7)). The room later gained a way to see other residents' characters walking
around it too — a small multiplayer-style addition answering the
project's multi-user and real-time requirements a second way
([`docs/adr/0014-laundry-presence.md`](docs/adr/0014-laundry-presence.md)).

由于对洗衣房物理布局进行了建模，另一个功能也有了实现基础——Letting the next person move a previous resident's uncollected laundry
to a drop-pff区。 这同样是我想自己遇到的、想要解决的痛点，and I'd imagined it as simple. 
但当我开始实现 3D 场景中的「拿起衣物、搬运、放置」这一完整动作时，才发现服务端根本没有与之对应的中间状态。

数据库在衣物被拿起的瞬间，就已经将整个交接操作记录为完成。因此，当 3D 场景仍然显示衣物正在被搬运时，服务端的数据却会不断覆盖场景中的状态。

要让这个交互真正正常工作，就必须在拿起和放置之间增加一个 in-transit 状态。同时，我还需要明确谁有权搬运衣物、如何完成置物架放置，以及什么时候通知原来的物主
([`docs/adr/0013-laundry-handoff-authorization.md`](docs/adr/0013-laundry-handoff-authorization.md)).
A good idea on paper still needed building to find what it missed.因此理解用户需求和真正实现一个可用的交互之间，仍然存在很大的距离。

The last real fork overruled a rejection that read as well-argued. The
home page's "Claim" button let anyone claim with no scan involved — 这是早期还没有 real QR code 时候选择一个省事的方法.。但既然现在有了3d洗衣房，我就想尽可能复原现实中认领洗衣机的方式。然而，当我让agent评估
"should claiming require a scan" 时，它concluded no: it would narrow "a phone
alone is enough," and tests would
behave differently from production. [`0015`](docs/adr/0015-scan-gated-claim.md)I pushed back: 如果不强制扫码证明到场，那么有人完全可以躺在房间里直接领取洗衣机，但却没有真正开始洗衣服，浪费后面人的时间。这恰恰是系统原本希望避免的不公平行为。
我也进一步检查了这个修改是否真的会破坏原有设计，而实际代码表明： `claim()` never verified arrival, an
unverified scan does the same work an unverified room number does for
identity, and every spec already calls `join()` before `claim()`, so
teaching them to scan first added one precondition without forking
anything. [`docs/adr/0016`](docs/adr/0016-scan-gated-claim-accepted.md) .最终此功能成功实现。

从上述过程可以看出。Automated checks (`pnpm check`) confirm the app builds and invariants
hold. They can't judge whether a decision honors the project's own
argument, or a rejection's premises are true — that judgment happened
by hand, logged in `process-notes.md`, the most load-bearing moments
promoted here.


