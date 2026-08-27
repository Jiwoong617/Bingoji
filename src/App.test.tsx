import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

describe("Bingoji app flow", () => {
  it("selects one of five characters and starts with the fixed normal battle map", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "게임 시작" }));

    expect(screen.getByRole("option", { name: /루키.*HP 42/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /건설 노동자.*HP 36/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /광대.*HP 30/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /과학자.*HP 32/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /광전사.*HP 34/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /과학자.*HP 32/ }));
    fireEvent.click(screen.getByRole("button", { name: "이 캐릭터로 시작" }));
    expect(screen.getByRole("heading", { name: "난이도 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "쉬움 난이도로 시작" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "보통 난이도로 시작" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "어려움 난이도로 시작" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "보통 난이도로 시작" }));

    expect(screen.getByRole("button", { name: /DESTINATION.*일반 전투/ })).toBeInTheDocument();
    expect(screen.queryByText("Elite 전투")).not.toBeInTheDocument();
    expect(screen.getByText("과학자")).toBeInTheDocument();
    expect(screen.getByText(/보통 · POOL/)).toBeInTheDocument();
  });

  it("centers a selected carousel character and separates the ability name from its description", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "게임 시작" }));
    expect(screen.queryByRole("button", { name: "이전 캐릭터" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다음 캐릭터" })).not.toBeInTheDocument();
    const worker = screen.getByRole("option", { name: /건설 노동자.*HP 36/ });
    const pointer = (target: Element, type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, { clientX: { value: clientX }, pointerId: { value: 1 } });
      fireEvent(target, event);
    };
    pointer(worker, "pointerdown", 500);
    pointer(worker, "pointerup", 500);
    fireEvent.click(worker);
    expect(worker).toHaveAttribute("aria-selected", "true");

    const clown = screen.getByRole("option", { name: /광대.*HP 30/ });
    pointer(clown, "pointerdown", 500);
    pointer(clown, "pointerup", 500);
    fireEvent.click(clown);
    expect(clown).toHaveAttribute("aria-selected", "true");
    expect(within(clown).queryByRole("heading", { name: "제발 한 대만" })).not.toBeInTheDocument();
    const details = screen.getByRole("region", { name: "광대 상세 정보" });
    expect(within(details).getByRole("heading", { name: "제발 한 대만" })).toBeInTheDocument();
    expect(screen.getByText(/기본 치명타 확률이 10% 증가/)).toBeInTheDocument();
  });

  it("moves the character carousel by dragging and keeps details on the centered card", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "게임 시작" }));
    const carousel = screen.getByRole("listbox", { name: "플레이어블 캐릭터 목록" });
    const dispatchPointer = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, { clientX: { value: clientX }, pointerId: { value: 1 } });
      fireEvent(carousel, event);
    };
    dispatchPointer("pointerdown", 220);
    dispatchPointer("pointermove", 190);
    expect(screen.getByRole("option", { name: /루키.*HP 42/ })).toHaveAttribute("aria-selected", "true");
    dispatchPointer("pointermove", 110);
    expect(screen.getByRole("option", { name: /건설 노동자.*HP 36/ })).toHaveAttribute("aria-selected", "true");
    dispatchPointer("pointerup", 110);
    const worker = screen.getByRole("option", { name: /건설 노동자.*HP 36/ });
    expect(worker).toHaveAttribute("aria-selected", "true");
    expect(within(worker).queryByRole("heading", { name: "안전 제일" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "건설 노동자 상세 정보" })).getByRole("heading", { name: "안전 제일" })).toBeInTheDocument();
    const rookie = screen.getByRole("option", { name: /루키.*HP 42/ });
    expect(within(rookie).queryByText("STARTING POOL")).not.toBeInTheDocument();
  });

  it("shows related status rules in Emoji details", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "게임 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "둥근 방패 정보 보기" }));
    const dialog = screen.getByRole("dialog", { name: "Emoji 정보" });
    expect(within(dialog).getByText("관련 BUFF / DEBUFF")).toBeInTheDocument();
    expect(within(dialog).getByText("방어막")).toBeInTheDocument();
    expect(within(dialog).getByText(/피해를 HP보다 먼저 흡수/)).toBeInTheDocument();
  });

  it("opens status details inline and dismisses them when another area is touched", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "게임 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "이 캐릭터로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "보통 난이도로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: /DESTINATION.*일반 전투/ }));
    expect(screen.getByText("들쥐 정찰병")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /황급한 도주:/ })).toBeInTheDocument();
    const critChance = screen.getAllByRole("button", { name: /치명타 확률:/ }).at(-1)!;
    fireEvent.click(critChance);
    expect(critChance).toHaveAttribute("aria-expanded", "true");
    expect(within(critChance).getByRole("tooltip")).toHaveTextContent("치명타 확률");
    fireEvent.pointerDown(document.body);
    expect(critChance).toHaveAttribute("aria-expanded", "false");
  });

  it("shows battle Pool selection and Emoji details in one top inventory panel", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "게임 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "이 캐릭터로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "보통 난이도로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: /DESTINATION.*일반 전투/ }));
    fireEvent.click(screen.getByRole("button", { name: /MY POOL/ }));

    const dialog = screen.getByRole("dialog", { name: "MY EMOJI POOL" });
    expect(dialog.closest(".modal-backdrop")).toHaveClass("modal-top");
    const sword = within(dialog).getByRole("button", { name: /쌍검/ });
    fireEvent.click(sword);
    expect(sword).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("heading", { name: "쌍검" })).toBeInTheDocument();
    expect(within(dialog).getByText("Bingo: 피해 2")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
